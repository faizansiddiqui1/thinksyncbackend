import Booking from "../models/user_models/Booking.js";
import TempBooking from "../models/user_models/TempBooking.js";
import { redeemOffer } from "./offer.service.js";

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

  const taxableAmount = Math.max(originalAmount - discountAmount, 0);
  const gstAmount = Math.round(taxableAmount * 0.18);

  return {
    basePrice: originalAmount,
    gstPercentage: 18,
    gstAmount,
    deposit: 0,
    discount: discountAmount,
    totalAmount,
  };
}

function normalizeResources(resources = []) {
  if (!Array.isArray(resources)) return [];

  return resources
    .map((r) => {
      const resourceId = r?.resourceId || r?.id || null;
      if (!resourceId) return null;

      return {
        resourceId,
        name: r?.name || "",
        type: r?.type || "",
        unitPrice: Number(r?.unitPrice || 0),
      };
    })
    .filter(Boolean);
}

export async function finalizeTempBooking({ orderId, paymentInfo, gateway }) {
  try {
    const temp = await TempBooking.findOne({
      orderId: paymentInfo.reference,
    });

    if (!temp) {
      console.log("❌ Temp not found for:", paymentInfo.reference);
      return { success: false, error: "Temp booking not found" };
    }

    if (temp.isFinalized) {
      console.log("⚠️ Already finalized:", paymentInfo.reference);
      return { success: true };
    }

    temp.isFinalized = true;
    await temp.save();

    const bookingData = temp.bookingData || {};
    const userId = getUserIdFromBookingData(bookingData);
    const spaceId = bookingData.space;
    const bookingAmount = Number(temp.totalAmount || bookingData.totalAmount || 0);

    let redeemed = null;

    if (temp.couponCode) {
      redeemed = await redeemOffer({
        offerCode: temp.couponCode,
        userId,
        spaceId,
        bookingAmount,
        bookingRef: orderId,
      });
    }

    const user = bookingData.user || {};
    const normalizedResources = normalizeResources(bookingData.resources);

    const finalBookingDoc = {
      user: {
        userId: bookingData.user?.userId || bookingData.userId || null,
        name: user.name || bookingData.name || "",
        email: user.email || bookingData.email || "",
        phone: user.phone || bookingData.phone || "",
      },

      space: bookingData.space,

      // ✅ IMPORTANT: save only normalized resources
      resources: normalizedResources,

      plan: bookingData.plan,
      bookingType: bookingData.bookingType,
      bookingDuration: bookingData.bookingDuration,

      startDateTime: bookingData.startDateTime,
      endDateTime: bookingData.endDateTime,
      timezone: bookingData.timezone || "Asia/Kolkata",

      specialRequests: bookingData.specialRequests || "",
      notes: bookingData.notes || "",
      adminNotes: bookingData.adminNotes || "",

      priceBreakdown: buildPriceBreakdown(temp, bookingAmount),

      payment: {
        method: bookingData?.payment?.method || "upi",
        status: "paid",
        gateway,
        transactionId: paymentInfo.transactionId || null,
        reference: paymentInfo.reference || orderId,
        paidAt: new Date(),
      },

      status: "confirmed",
    };

    // helpful debug
    console.log("✅ FINAL BOOKING RESOURCES:", finalBookingDoc.resources);

    await Booking.create(finalBookingDoc);

    await TempBooking.deleteOne({
      orderId: paymentInfo.reference,
    });

    return { success: true };
  } catch (error) {
    console.error("❌ finalizeTempBooking error:", error);
    return { success: false, error: error.message };
  }
}