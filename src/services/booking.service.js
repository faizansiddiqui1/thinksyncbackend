import Booking from "../models/user_models/Booking.js";
import Space from "../models/admin_models/Space.js";
import dayjs from "dayjs";
import { resolveGateway } from "../services/paymentGatewayResolver.service.js";
import * as cashfreeService from "../services/cashfree.service.js";
import * as razorpayService from "../services/razorpay.service.js";
import { getTenantIdFromSpace } from "../utils/getTenantIdFromSpace.js";
import mongoose from "mongoose";
import TempBooking from "../models/user_models/TempBooking.js";
import { validateOfferPreview } from "./offer.service.js"; // make sure path is correct
import User from "../models/user_models/User.js";

/* =========================
   Create Booking 
========================= */
export const createBooking = async (bookingData, tenantIdOverride = null) => {
  try {
    const {
      space: spaceId,
      bookingDuration,
      plan,
      quantity,
      resources = [],
      couponCode: rawCouponCode, // optional
    } = bookingData;

    const customerPayload = bookingData.customer || bookingData.user || {};

    let dbUser = null;

    if (bookingData.userId) {
      dbUser = await User.findById(bookingData.userId);
    }

    if (!dbUser) {
      return { success: false, error: "User not found" };
    }

    // load space
    const space = await Space.findById(spaceId)
      .populate("resources")
      .populate("pricingPlans");
    if (!space || !space.isPublished) {
      return { success: false, error: "Space not found" };
    }

    // frontend final amount (base)
    const originalAmount = Number(
      bookingData.totalAmount || bookingData.total || 0,
    );
    
    if (originalAmount <= 0) {
      return {
        success: false,
        error: "Total amount missing or invalid from frontend",
      };
    }

    // tenant + gateway resolution
    const tenantId = tenantIdOverride || (await getTenantIdFromSpace(spaceId));
    const gatewayResolved = await resolveGateway(tenantId);
    if (!gatewayResolved || !gatewayResolved.gateway) {
      return { success: false, error: "Payment gateway not configured" };
    }

    // prepare internal id
    const internalBookingId = `booking_${new mongoose.Types.ObjectId()}`;

    // OFFER VALIDATION (server-side final)
    let couponCode = rawCouponCode
      ? String(rawCouponCode).toUpperCase().trim()
      : null;
    let discountAmount = 0;
    let finalAmount = originalAmount;
    let appliedOffer = null;

    if (couponCode) {
      try {
        const offerResult = await validateOfferPreview({
          spaceId,
          code: couponCode,
          userId: bookingData.user?.userId || bookingData.userId || null,
          planType: plan?.type || plan?.pricingType || null,
          bookingAmount: originalAmount,
        });

        console.log("Offer result", offerResult);

        // validateOfferPreview returns discountAmount and finalAmount
        discountAmount = Number(offerResult.discountAmount || 0);
        finalAmount = Number(offerResult.finalAmount || originalAmount);
        appliedOffer = offerResult.offer || null;
      } catch (err) {
        // Offer invalid — surface an error so frontend can show message
        return { success: false, error: `Offer invalid: ${err.message}` };
      }
    }

    // finalAmount must be > 0 (you can allow 0 if you support free bookings)
    if (finalAmount < 0) finalAmount = 0;

    // create gateway order (use finalAmount)
    const gatewayName = gatewayResolved.gateway;
    let gatewayOrderId = null;
    let normalizedPaymentData = null;

    if (gatewayName === "cashfree") {
      const cfResp = await cashfreeService.createCashfreeOrder({
        credentials: gatewayResolved.credentials,
        orderId: internalBookingId, // pass internal id if you want mapping
        amount: finalAmount,
        currency: "INR",

        customer: {
          name: dbUser.username,
          email: dbUser.email,
          phone: dbUser.phoneNumber,
        },
      });

      // normalize response (adapt if your cashfreeService shape differs)
      gatewayOrderId =
        cfResp?.orderId ||
        cfResp?.paymentSessionId ||
        cfResp?.data?.orderId ||
        internalBookingId;

      normalizedPaymentData = {
        orderId: gatewayOrderId,
        payment_session_id:
          cfResp?.paymentSessionId ||
          cfResp?.data?.paymentSessionId ||
          gatewayOrderId,
        raw: cfResp,
      };
    } else if (gatewayName === "razorpay") {
      const instance = razorpayService.createRazorpayInstance(
        gatewayResolved.credentials,
      );

      // NOTE: razorpay usually expects amount in paise (depends on helper). Keep same semantics as your existing razorpayService
      const razorpayOrder = await razorpayService.createRazorpayOrder({
        instance,
        amount: finalAmount,
        currency: "INR",
        receipt: internalBookingId,
      });

      if (!razorpayOrder || !razorpayOrder.id) {
        return { success: false, error: "Failed to create Razorpay order" };
      }

      gatewayOrderId = razorpayOrder.id;
      normalizedPaymentData = {
        orderId: gatewayOrderId,
        payment_session_id: gatewayOrderId,
        key: gatewayResolved.credentials.keyId,
        raw: razorpayOrder,
      };
    } else {
      return { success: false, error: "Unsupported gateway" };
    }

    if (!gatewayOrderId || !normalizedPaymentData) {
      return { success: false, error: "Failed to initialize payment" };
    }

    const finalUser = {
      userId: dbUser._id,
      name: dbUser.username,
      email: dbUser.email,
      phone: dbUser.phoneNumber,
    };

    bookingData.user = finalUser;

    const tempPayload = {
      orderId: gatewayOrderId,
      internalBookingId,
      bookingData,
      originalAmount,
      totalAmount: finalAmount,
      discountAmount,
      couponCode: couponCode || null,
      offerId: appliedOffer ? appliedOffer.id : null,
      gateway: gatewayName,
      createdAt: new Date(),
    };

    await TempBooking.create(tempPayload);

    console.log("👉 SESSION:", normalizedPaymentData.payment_session_id);

    return {
      success: true,
      data: {
        orderId: gatewayOrderId,
        payment: normalizedPaymentData,
        gateway: gatewayName,
        internalBookingId,
        originalAmount,
        finalAmount,
        discountAmount,
        couponCode: couponCode || null,
        offer: appliedOffer || null,
      },
    };
  } catch (error) {
    console.error("createBooking error:", error);
    return { success: false, error: error.message || String(error) };
  }
};


export const getOwnerBookings = async (ownerId, filters = {}) => {
  try {
    const {
      status,
      page = 1,
      limit = 20,
      upcoming = false,
      past = false,
      active = false,
    } = filters;

    const skip = (page - 1) * limit;

    // 1) Find all spaces owned by this admin
    const spaces = await Space.find({ owner: ownerId }).select("_id name owner");
    const spaceIds = spaces.map((s) => s._id);

    if (!spaceIds.length) {
      return {
        success: true,
        data: {
          bookings: [],
          stats: {
            total: 0,
            confirmed: 0,
            pending: 0,
            cancelled: 0,
            completed: 0,
            upcoming: 0,
            active: 0,
            expired: 0,
          },
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        },
      };
    }

    // 2) Build query
    const now = new Date();
    const query = { space: { $in: spaceIds } };

    if (status) query.status = status;

    if (upcoming) {
      query.startDateTime = { $gt: now };
    }

    if (past) {
      query.endDateTime = { $lt: now };
    }

    if (active) {
      query.startDateTime = { $lte: now };
      query.endDateTime = { $gte: now };
      query.status = { $in: ["confirmed", "pending", "pending_hold"] };
    }

    const [bookings, total, allMatched] = await Promise.all([
      Booking.find(query)
        .populate("space", "name slug address owner")
        .populate("user.userId", "username email phoneNumber")
        .sort({ startDateTime: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Booking.countDocuments(query),
      Booking.find(query).select("status startDateTime endDateTime holdExpiresAt"),
    ]);

    // 3) Stats for dashboard
    const stats = {
      total: allMatched.length,
      confirmed: allMatched.filter((b) => b.status === "confirmed").length,
      pending: allMatched.filter((b) => b.status === "pending").length,
      cancelled: allMatched.filter((b) => b.status === "cancelled").length,
      completed: allMatched.filter((b) => b.status === "completed").length,
      expired: allMatched.filter((b) => b.status === "expired").length,
      upcoming: allMatched.filter((b) => b.startDateTime > now).length,
      active: allMatched.filter(
        (b) => b.startDateTime <= now && b.endDateTime >= now,
      ).length,
    };

    // 4) Add timer fields for frontend
    const enrichedBookings = bookings.map((b) => {
      const obj = b.toObject();
      const startMs = new Date(obj.startDateTime).getTime() - now.getTime();
      const endMs = new Date(obj.endDateTime).getTime() - now.getTime();
      const holdMs = obj.holdExpiresAt
        ? new Date(obj.holdExpiresAt).getTime() - now.getTime()
        : null;

      return {
        ...obj,
        timers: {
          startsInMs: startMs,
          endsInMs: endMs,
          holdExpiresInMs: holdMs,
          isUpcoming: startMs > 0,
          isActive: startMs <= 0 && endMs >= 0,
          isExpiredHold: obj.status === "pending_hold" && holdMs !== null && holdMs <= 0,
        },
      };
    });

    return {
      success: true,
      data: {
        bookings: enrichedBookings,
        stats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};





/* =========================
   Get Booking By ID
========================= */
export const getBookingById = async (id) => {
  try {
    const booking = await Booking.findById(id)
      .populate("space")
      .populate("user.userId");

    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get User Bookings
========================= */
export const getUserBookings = async (userId, filters = {}) => {
  try {
    const { status, upcoming, past, page = 1, limit = 20 } = filters;

    const query = { "user.userId": userId };

    if (status) query.status = status;
    if (upcoming) query["bookingDuration.startDate"] = { $gte: new Date() };
    if (past) query["bookingDuration.endDate"] = { $lt: new Date() };

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate("space", "name slug images address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    return {
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get Space Bookings
========================= */
export const getSpaceBookings = async (spaceId, filters = {}) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = filters;

    const query = { space: spaceId };

    if (status) query.status = status;

    if (startDate || endDate) {
      query["bookingDuration.startDate"] = {};
      if (startDate)
        query["bookingDuration.startDate"] = { $lte: new Date(endDate) };

      if (endDate)
        query["bookingDuration.endDate"] = { $gte: new Date(startDate) };
    }

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate("user.userId", "name email phone")
      .sort({ "bookingDuration.startDate": 1 })
      .skip(skip)
      .limit(limit);

    const total = await Booking.countDocuments(query);

    return {
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Update Booking Status
========================= */
export const updateBookingStatus = async (id, status, notes = "") => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    booking.status = status;
    if (notes) booking.adminNotes = notes;

    if (status === "confirmed" && booking.payment.status === "paid") {
      booking.invoice.invoiceDate = new Date();
    }

    await booking.save();
    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Cancel Booking
========================= */
export const cancelBooking = async (id, cancelledBy, reason = "") => {
  try {
    const booking = await Booking.findById(id).populate("space");
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    if (booking.status === "cancelled") {
      return { success: false, error: "Booking already cancelled" };
    }

    const hoursUntilStart = dayjs(booking.bookingDuration.startDate).diff(
      dayjs(),
      "hour",
    );

    let refundAmount = 0;
    if (hoursUntilStart > 24) {
      refundAmount = booking.priceBreakdown.totalAmount;
    } else if (hoursUntilStart > 12) {
      refundAmount = booking.priceBreakdown.totalAmount * 0.5;
    }

    booking.status = "cancelled";
    booking.cancellation = {
      cancelledBy,
      cancelledAt: new Date(),
      reason,
      refundAmount,
    };

    if (refundAmount > 0 && booking.payment.status === "paid") {
      booking.payment.status = "refunded";
      booking.payment.refundedAt = new Date();
      booking.payment.refundAmount = refundAmount;
    }

    await booking.save();
    return { success: true, data: booking, refundAmount };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Check In / Check Out
========================= */
export const checkIn = async (id) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    if (booking.status !== "confirmed") {
      return { success: false, error: "Booking not confirmed" };
    }

    booking.checkIn.status = true;
    booking.checkIn.time = new Date();
    await booking.save();

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const checkOut = async (id) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    if (!booking.checkIn.status) {
      return {
        success: false,
        error: "Must check in before checking out",
      };
    }

    booking.checkOut.status = true;
    booking.checkOut.time = new Date();
    booking.status = "completed";
    await booking.save();

    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Update Payment
========================= */
export const updatePaymentStatus = async (id, paymentData) => {
  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    booking.payment = {
      ...booking.payment,
      ...paymentData,
      paidAt:
        paymentData.status === "paid" ? new Date() : booking.payment.paidAt,
    };

    if (paymentData.status === "paid") {
      booking.status = "confirmed";
    }

    await booking.save();
    return { success: true, data: booking };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Booking Stats
========================= */
export const getBookingStats = async (spaceId, startDate, endDate) => {
  try {
    const query = { space: spaceId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const bookings = await Booking.find(query);

    const stats = {
      total: bookings.length,
      confirmed: bookings.filter((b) => b.status === "confirmed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      completed: bookings.filter((b) => b.status === "completed").length,
      pending: bookings.filter((b) => b.status === "pending").length,
      totalRevenue: bookings
        .filter((b) => b.payment.status === "paid")
        .reduce((sum, b) => sum + b.priceBreakdown.totalAmount, 0),
      avgBookingValue: 0,
    };

    if (stats.total > 0) {
      stats.avgBookingValue = stats.totalRevenue / stats.total;
    }

    return { success: true, data: stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
