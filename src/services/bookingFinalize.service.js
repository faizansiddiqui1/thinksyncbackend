import Booking from "../models/user_models/Booking.js";
import TempBooking from "../models/user_models/TempBooking.js";
import { redeemOffer } from "./offer.service.js";
import * as googleCalendarService from "./googleCalendar.service.js";
import {
  sendBookingConfirmationEmail,
  sendShortTermBookingAccessEmail,
} from "./mail.service.js";
import { ensureBookingAccessCredential } from "./securityAccess/securityAccess.service.js";

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

function buildLegacyBooking(temp, paymentInfo, gateway) {
  const bookingData = temp.bookingData || {};
  const user = bookingData.user || {};
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
    specialRequests: bookingData.specialRequests || "",
    notes: bookingData.notes || "",
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
    status: "confirmed",
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

      booking.status = "confirmed";
      booking.holdExpiresAt = null;
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

    sendBookingConfirmationEmail({ booking }).catch((error) => {
      console.error("booking confirmation email failed:", error.message);
    });

    try {
      const userId = booking.user?.userId || null;
      if (userId && !booking.googleEventId) {
        await googleCalendarService.createEventForBooking(booking._id, userId);
      }
    } catch (error) {
      console.error("google calendar create failed:", error?.message || error);
    }

    let bookingAccess = null;
    try {
      bookingAccess = await ensureBookingAccessCredential(booking);
    } catch (error) {
      console.error("booking access credential generation failed:", error?.message || error);
    }

    await TempBooking.deleteOne({ _id: claimedTemp._id });

    if (bookingAccess) {
      sendShortTermBookingAccessEmail({ booking, access: bookingAccess }).catch(
        (error) => console.error("short-term booking access email failed:", error.message),
      );
    }

    return { success: true, data: booking };
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
