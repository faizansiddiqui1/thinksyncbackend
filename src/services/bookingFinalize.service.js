import Booking from "../models/user_models/Booking.js";
import TempBooking from "../models/user_models/TempBooking.js";
import { redeemOffer } from "./offer.service.js";
import { syncBookingToConnectedCalendars } from "./calendarSync.service.js";
import {
  sendBookingConfirmationEmail,
  sendShortTermBookingAccessEmail,
} from "./mail.service.js";
import { ensureBookingAccessCredential } from "./securityAccess/securityAccess.service.js";
import { activatePaidPlanPurchase } from "./planMembership.service.js";
import { markBookingDraftCompleted } from "./bookingDraft.service.js";

function getUserIdFromBookingData(bookingData) {
  return (
    bookingData?.userId ||
    bookingData?.user?.userId ||
    bookingData?.customer?.userId ||
    null
  );
}

function buildPriceBreakdown(temp, bookingAmount) {
  const originalAmount = Number(temp.originalAmount || bookingAmount || 0);
  const totalAmount = Number(temp.totalAmount || bookingAmount || 0);
  const discountAmount = Number(temp.discountAmount || 0);

  return {
    basePrice: Math.max(originalAmount - discountAmount, 0),
    gstPercentage: 18,
    gstAmount: 0,
    deposit: 0,
    discount: discountAmount,
    totalAmount,
  };
}

function normalizeResources(resources = []) {
  if (!Array.isArray(resources)) return [];
  return resources
    .map((resource) => {
      const resourceId = resource?.resourceId || resource?._id || resource?.id;
      if (!resourceId) return null;
      return {
        resourceId,
        name: resource?.name || "",
        type: resource?.type || "",
        quantity: Number(resource?.quantity || resource?.qty || 1),
        unitPrice: Number(resource?.unitPrice || resource?.price || 0),
      };
    })
    .filter(Boolean);
}

function normalizeAddons(addons = []) {
  if (!Array.isArray(addons)) return [];
  return addons
    .map((addon) => {
      const addonId = addon?.addonId || addon?._id || addon?.id;
      if (!addonId) return null;
      return {
        addonId,
        name: addon?.name || addon?.title || "",
        type: addon?.type || "",
        quantity: Number(addon?.quantity || addon?.qty || 1),
        unitPrice: Number(addon?.unitPrice || addon?.price || 0),
      };
    })
    .filter(Boolean);
}

function isPlanMembershipCheckout(bookingData = {}) {
  return bookingData.purchaseIntent === "PLAN_MEMBERSHIP";
}

async function ensurePlanPurchaseForMembership({ bookingData, paymentInfo, gateway }) {
  const userId = getUserIdFromBookingData(bookingData);
  const planId = bookingData?.plan?.planId;
  const startDate =
    bookingData?.startDateTime ||
    bookingData?.bookingDuration?.startDate ||
    bookingData?.bookingDate ||
    null;

  if (!userId || !planId || !startDate) {
    throw new Error("Membership checkout is missing user, plan, or start date");
  }

  const purchase = await activatePaidPlanPurchase(
    {
      _id: userId,
      name: bookingData?.user?.name || bookingData?.name || "",
      username: bookingData?.user?.name || bookingData?.name || "",
      email: bookingData?.user?.email || bookingData?.email || "",
      phone: bookingData?.user?.phone || bookingData?.phone || "",
      phoneNumber: bookingData?.user?.phone || bookingData?.phone || "",
    },
    {
      planId,
      startDate,
      paymentMethod: gateway,
      paymentReference: paymentInfo.reference,
    },
  );

  if (!purchase?.success) {
    throw new Error(purchase?.error || "Plan purchase activation failed");
  }

  return purchase.data;
}

function buildLegacyBooking(temp, paymentInfo, gateway) {
  const bookingData = temp.bookingData || {};
  const user = bookingData.user || {};
  const isMembership = isPlanMembershipCheckout(bookingData);
  return {
    bookingId: temp.internalBookingId || undefined,
    user: {
      userId: bookingData.user?.userId || bookingData.userId || null,
      name: user.name || bookingData.name || "",
      email: user.email || bookingData.email || "",
      phone: user.phone || bookingData.phone || "",
    },
    spaceType: bookingData.spaceType,
    space: bookingData.space,
    resources: normalizeResources(bookingData.resources),
    addons: normalizeAddons(bookingData.addons),
    plan: bookingData.plan,
    bookingType: bookingData.bookingType,
    bookingDuration: bookingData.bookingDuration,
    startDateTime: bookingData.startDateTime,
    endDateTime: bookingData.endDateTime,
    timezone: bookingData.timezone || "Asia/Kolkata",
    purchaseIntent: bookingData.purchaseIntent || "BOOKING",
    specialRequests: bookingData.specialRequests || "",
    notes: isMembership
      ? "Membership plan purchase checkout"
      : bookingData.notes || "",
    adminNotes: bookingData.adminNotes || "",
    priceBreakdown: buildPriceBreakdown(temp, temp.totalAmount),
    payment: {
      method: bookingData?.payment?.method || "upi",
      status: "paid",
      gateway,
      transactionId: paymentInfo.transactionId || null,
      reference: paymentInfo.reference,
      paidAt: new Date(),
    },
    paymentStatus: "paid",
    status: isMembership ? "completed" : "confirmed",
  };
}

async function findPaidBooking(reference) {
  return Booking.findOne({
    $or: [
      { "payment.reference": reference },
      { "payment.attempts.orderId": reference },
    ],
    "payment.status": "paid",
  });
}

export async function finalizeTempBooking({ orderId, paymentInfo, gateway }) {
  let claimedTemp = null;
  try {
    const reference = paymentInfo.reference || orderId;
    const temp = await TempBooking.findOne({ orderId: reference });

    if (!temp) {
      const paidBooking = await findPaidBooking(reference);
      return paidBooking
        ? { success: true, data: paidBooking }
        : { success: false, error: "Temp booking not found" };
    }

    const existingBooking = temp.bookingId
      ? await Booking.findById(temp.bookingId)
      : null;
    if (existingBooking?.payment?.status === "paid") {
      const bookingData = temp.bookingData || {};
      if (isPlanMembershipCheckout(bookingData) && !existingBooking.planPurchase) {
        const planPurchase = await ensurePlanPurchaseForMembership({
          bookingData,
          paymentInfo: { ...paymentInfo, reference },
          gateway,
        });
        existingBooking.planPurchase = planPurchase?._id || planPurchase?.id || null;
        existingBooking.status = "completed";
        existingBooking.purchaseIntent = "PLAN_MEMBERSHIP";
        await existingBooking.save();
      }
      await markBookingDraftCompleted(
        existingBooking?.sourceDraftId || temp?.draftId || null,
        "paid",
      ).catch(() => null);
      await TempBooking.deleteOne({ _id: temp._id });
      return { success: true, data: existingBooking };
    }

    claimedTemp = await TempBooking.findOneAndUpdate(
      { _id: temp._id, isFinalized: { $ne: true } },
      { $set: { isFinalized: true } },
      { new: true },
    );
    if (!claimedTemp) return { success: true, processing: true };

    const bookingData = claimedTemp.bookingData || {};
    const isMembership = isPlanMembershipCheckout(bookingData);
    const userId = getUserIdFromBookingData(bookingData);
    if (claimedTemp.couponCode) {
      await redeemOffer({
        offerCode: claimedTemp.couponCode,
        userId,
        spaceId: bookingData.space,
        bookingAmount: Number(
          claimedTemp.originalAmount || claimedTemp.totalAmount || 0,
        ),
        bookingRef: orderId,
      });
    }

    let booking = existingBooking;
    if (booking) {
      const attempts = booking.payment?.attempts || [];
      const attempt = attempts.find((item) => item.orderId === reference);
      if (attempt) {
        attempt.status = "paid";
        attempt.updatedAt = new Date();
      }

      booking.status = isMembership ? "completed" : "confirmed";
      booking.holdExpiresAt = null;
      booking.purchaseIntent = bookingData.purchaseIntent || booking.purchaseIntent || "BOOKING";
      booking.payment = {
        ...booking.payment.toObject?.(),
        method: booking.payment?.method || bookingData?.payment?.method || "upi",
        status: "paid",
        gateway,
        transactionId: paymentInfo.transactionId || null,
        reference,
        paidAt: new Date(),
        attempts,
      };
      booking.paymentStatus = "paid";
      await booking.save();
    } else {
      booking = await Booking.create(
        buildLegacyBooking(claimedTemp, { ...paymentInfo, reference }, gateway),
      );
    }

    let planPurchase = null;
    if (isMembership) {
      planPurchase = await ensurePlanPurchaseForMembership({
        bookingData,
        paymentInfo: { ...paymentInfo, reference },
        gateway,
      });
      booking.planPurchase = planPurchase?._id || planPurchase?.id || null;
      booking.status = "completed";
      booking.holdExpiresAt = null;
      booking.notes = "Membership plan purchased. Resource reservations are created separately.";
      await booking.save();
    } else {
      sendBookingConfirmationEmail({ booking }).catch((error) => {
        console.error("booking confirmation email failed:", error.message);
      });
    }

    if (!isMembership) {
      try {
        const userId = booking.user?.userId || null;
        if (userId) {
          await syncBookingToConnectedCalendars(booking._id, userId);
        }
      } catch (error) {
        console.error("calendar create failed:", error?.message || error);
      }
    }

    let bookingAccess = null;
    if (!isMembership) {
      try {
        bookingAccess = await ensureBookingAccessCredential(booking);
      } catch (error) {
        console.error("booking access credential generation failed:", error?.message || error);
      }
    }

    await markBookingDraftCompleted(
      booking?.sourceDraftId || claimedTemp?.draftId || null,
      "paid",
    ).catch(() => null);

    await TempBooking.deleteOne({ _id: claimedTemp._id });

    if (bookingAccess) {
      sendShortTermBookingAccessEmail({ booking, access: bookingAccess }).catch(
        (error) => console.error("short-term booking access email failed:", error.message),
      );
    }

    return { success: true, data: isMembership ? { booking, planPurchase } : booking };
  } catch (error) {
    console.error("finalizeTempBooking error:", error);
    if (claimedTemp?._id) {
      await TempBooking.updateOne(
        { _id: claimedTemp._id },
        { $set: { isFinalized: false } },
      ).catch(() => null);
    }
    return { success: false, error: error.message };
  }
}
