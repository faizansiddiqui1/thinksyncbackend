import Booking from "../models/user_models/Booking.js";
import Space from "../models/admin_models/Space.js";
import dayjs from "dayjs";
import { resolveGateway } from "../services/paymentGatewayResolver.service.js";
import * as cashfreeService from "../services/cashfree.service.js";
import * as razorpayService from "../services/razorpay.service.js";
import { getTenantIdFromSpace } from "../utils/getTenantIdFromSpace.js";
import {
  getCompanySpaceIds,
  getScopeOwnerId,
  hasCompanySpaceAccess,
} from "./spaceAccess.service.js";
import mongoose from "mongoose";
import TempBooking from "../models/user_models/TempBooking.js";
import { validateOfferPreview } from "./offer.service.js"; // make sure path is correct
import User from "../models/user_models/User.js";

function withReviewState(booking) {
  const paymentStatus =
    booking?.paymentStatus || booking?.payment?.status || "pending";
  const reviewEligible =
    booking?.status === "completed" && paymentStatus === "paid";

  return {
    ...booking,
    paymentStatus,
    reviewEligible,
    reviewMailSent: Boolean(booking?.reviewMailSent),
    reviewSubmitted: Boolean(booking?.reviewSubmitted),
    reviewNotificationPending: Boolean(
      booking?.reviewNotificationPending,
    ),
  };
}

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
      addons = [],

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
        cfResp?.order_id || cfResp?.data?.order_id || internalBookingId;

      console.log("CF RESPONSE:", cfResp);

      normalizedPaymentData = {
        orderId:
          cfResp?.order_id || cfResp?.data?.order_id || internalBookingId,

        payment_session_id:
          cfResp?.payment_session_id || cfResp?.data?.payment_session_id,

        raw: cfResp,
      };
      if (!normalizedPaymentData.payment_session_id) {
        throw new Error("Cashfree payment_session_id missing");
      }
    } else if (gatewayName === "razorpay") {
      const instance = await razorpayService.createRazorpayInstance(
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

function normalizeBookingResources(resources = []) {
  if (!Array.isArray(resources)) return [];

  return resources
    .map((resource) => {
      const resourceId = resource?.resourceId || resource?._id || resource?.id;
      if (!resourceId) return null;

      return {
        resourceId,
        name: resource?.name || "",
        type: resource?.type || "",
        quantity: Number(resource?.quantity || resource?.qty || 1) || 1,
        unitPrice: Number(resource?.unitPrice || resource?.price || 0) || 0,
      };
    })
    .filter(Boolean);
}

function getInternalPlanType(bookingType = "daily") {
  const normalized = String(bookingType || "daily").toLowerCase();
  if (normalized === "hourly") return "hourly";
  if (normalized === "monthly") return "monthly";
  return "daily";
}

export const createInternalWorkspaceBooking = async (bookingData, authUser) => {
  try {
    if (!authUser?._id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!authUser?.companyId) {
      return {
        success: false,
        error: "Internal workspace booking is only available for assigned company users",
      };
    }

    const requestedUserId = bookingData?.userId || bookingData?.user?.userId || null;
    if (requestedUserId && String(requestedUserId) !== String(authUser._id)) {
      return {
        success: false,
        error: "You can only create internal bookings for your own account",
      };
    }

    const spaceId = bookingData?.space;
    if (!spaceId) {
      return { success: false, error: "Space is required" };
    }

    const hasAccess = await hasCompanySpaceAccess(authUser, spaceId);
    if (!hasAccess) {
      return {
        success: false,
        error: "You do not have access to this workspace",
      };
    }

    const space = await Space.findById(spaceId).select(
      "_id name slug isPublished spaceType listingModes",
    );
    if (!space) {
      return { success: false, error: "Space not found" };
    }

    const normalizedResources = normalizeBookingResources(bookingData?.resources);
    if (!normalizedResources.length) {
      return {
        success: false,
        error: "At least one resource is required for internal booking",
      };
    }

    const startDateTime = bookingData?.startDateTime
      ? new Date(bookingData.startDateTime)
      : null;
    const endDateTime = bookingData?.endDateTime
      ? new Date(bookingData.endDateTime)
      : null;

    if (
      !startDateTime ||
      !endDateTime ||
      Number.isNaN(startDateTime.getTime()) ||
      Number.isNaN(endDateTime.getTime()) ||
      endDateTime <= startDateTime
    ) {
      return {
        success: false,
        error: "Valid start and end time are required",
      };
    }

    for (const resource of normalizedResources) {
      const availability = await Booking.checkAvailability(
        resource.resourceId,
        startDateTime,
        endDateTime,
      );

      if (!availability?.available) {
        return {
          success: false,
          error: `${resource.name || "This resource"} is already reserved for the selected time`,
        };
      }
    }

    const subtotal =
      Number(bookingData?.priceBreakdown?.basePrice || bookingData?.subtotal || 0) ||
      normalizedResources.reduce(
        (sum, resource) =>
          sum + Number(resource.unitPrice || 0) * Number(resource.quantity || 1),
        0,
      );
    const gstAmount = Number(bookingData?.priceBreakdown?.gstAmount || 0) || 0;
    const totalAmount =
      Number(bookingData?.priceBreakdown?.totalAmount || bookingData?.totalAmount || 0) ||
      subtotal + gstAmount;
    const paymentReference = `internal_${new mongoose.Types.ObjectId()}`;
    const bookingType = String(bookingData?.bookingType || "daily").toLowerCase();

    const booking = await Booking.create({
      user: {
        userId: authUser._id,
        name: authUser.username || "",
        email: authUser.email || "",
        phone: authUser.phoneNumber || "",
      },
      space: spaceId,
      spaceType: bookingData?.spaceType || space.spaceType || "resource",
      resources: normalizedResources,
      addons: [],
      plan: {
        planId: null,
        type: getInternalPlanType(bookingType),
      },
      bookingType,
      bookingDuration: {
        startDate: bookingData?.bookingDuration?.startDate || startDateTime,
        endDate: bookingData?.bookingDuration?.endDate || endDateTime,
        startTime: bookingData?.bookingDuration?.startTime || null,
        endTime: bookingData?.bookingDuration?.endTime || null,
        totalDays: Number(bookingData?.bookingDuration?.totalDays || 0) || 0,
        totalHours: Number(bookingData?.bookingDuration?.totalHours || 0) || 0,
      },
      startDateTime,
      endDateTime,
      timezone: bookingData?.timezone || "Asia/Kolkata",
      priceBreakdown: {
        basePrice: subtotal,
        gstPercentage: Number(
          bookingData?.priceBreakdown?.gstPercentage || 18,
        ),
        gstAmount,
        deposit: Number(bookingData?.priceBreakdown?.deposit || 0) || 0,
        discount: Number(bookingData?.priceBreakdown?.discount || 0) || 0,
        totalAmount,
      },
      status: "confirmed",
      payment: {
        method: "internal",
        status: "paid",
        gateway: "internal_workspace",
        reference: paymentReference,
        paidAt: new Date(),
      },
      paymentStatus: "paid",
      specialRequests: bookingData?.specialRequests || "",
      notes: bookingData?.notes || "",
      holdExpiresAt: null,
    });

    return {
      success: true,
      data: {
        booking,
      },
    };
  } catch (error) {
    console.error("createInternalWorkspaceBooking error:", error);
    return { success: false, error: error.message || String(error) };
  }
};

function normalizeKycStatus(status) {
  const raw = String(status || "").toLowerCase();

  if (["verified", "approved", "completed"].includes(raw)) {
    return "completed";
  }

  if (
    [
      "not_submitted",
      "pending",
      "awaiting_selfie",
      "rejected",
      "failed",
      "",
      "null",
      "undefined",
    ].includes(raw)
  ) {
    return "not_completed";
  }

  return raw;
}

function isKycCompleted(status) {
  return normalizeKycStatus(status) === "completed";
}

function matchesKycFilter(rawStatus, filter) {
  if (!filter || filter === "all") return true;

  const raw = String(rawStatus || "").toLowerCase();
  const normalized = normalizeKycStatus(raw);

  if (filter === "completed") return normalized === "completed";
  if (filter === "not_completed") return normalized === "not_completed";

  // exact raw status filters like verified, pending, not_submitted, awaiting_selfie, rejected
  return raw === filter;
}

export const getOwnerBookings = async (user, filters = {}) => {
  try {
    const {
      status,
      kycStatus = "all",
      paymentStatus,
      requestedOwnerId = null,
      spaceId = null,
      startDate,
      endDate,
      isSuperAdmin = false,
      page = 1,
      limit = 20,
      upcoming = false,
      past = false,
      active = false,
    } = filters;

    const companySpaceIds = await getCompanySpaceIds(user);
    const scopeOwnerId = !isSuperAdmin ? await getScopeOwnerId(user) : null;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(Math.max(1, Number(limit) || 20), 100);
    const now = new Date();
    const query = {};

    let scopedSpaceIds = [];

    if (spaceId) {
      if (!isSuperAdmin) {
        let allowedSpace = null;

        if (companySpaceIds?.length) {
          allowedSpace = await Space.findOne({
            _id: spaceId,
            _id: { $in: companySpaceIds },
          })
            .select("_id")
            .lean();
        } else if (scopeOwnerId) {
          allowedSpace = await Space.findOne({
            _id: spaceId,
            owner: scopeOwnerId,
          })
            .select("_id")
            .lean();
        }

        if (!allowedSpace) {
          return {
            success: true,
            data: {
              bookings: [],
              stats: {},
              pagination: {
                page: pageNum,
                limit: limitNum,
                total: 0,
                pages: 0,
              },
            },
          };
        }
      }
      scopedSpaceIds = [spaceId];
    } else if (!isSuperAdmin || requestedOwnerId) {
      let spaceQuery = null;

      if (isSuperAdmin && requestedOwnerId) {
        spaceQuery = { owner: requestedOwnerId };
      } else if (companySpaceIds?.length) {
        spaceQuery = { _id: { $in: companySpaceIds } };
      } else {
        spaceQuery = { owner: scopeOwnerId };
      }

      const spaces = await Space.find(spaceQuery).select("_id").lean();
      scopedSpaceIds = spaces.map((space) => space._id);

      if (!scopedSpaceIds.length) {
        return {
          success: true,
          data: {
            bookings: [],
            stats: {},
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: 0,
              pages: 0,
            },
          },
        };
      }
    }

    if (scopedSpaceIds.length) {
      query.space = { $in: scopedSpaceIds };
    }

    if (status) query.status = status;
    if (paymentStatus) query["payment.status"] = paymentStatus;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (upcoming) {
      query.startDateTime = { $gt: now };
    }

    if (past) {
      query.endDateTime = { $lt: now };
    }

    if (active) {
      query.startDateTime = { $lte: now };
      query.endDateTime = { $gte: now };
      query.status = {
        $in: ["confirmed", "pending", "pending_hold"],
      };
    }

    const rawBookings = await Booking.find(query)
      .populate({
        path: "space",
        select: "name slug address startingPrice owner status isPublished",
        populate: [
          {
            path: "media",
            select: "images video",
          },
          {
            path: "owner",
            select: "username email phoneNumber kyc role",
          },
        ],
      })
      .populate({
        path: "resources.resourceId",
        model: "Resource",
        select: "name type images price capacity",
      })
      .populate({
        path: "addons.addonId",
        model: "Addon",
        select: "title type images price",
      })
      .populate({
        path: "user.userId",
        select: `
          username
          email
          phoneNumber
          profileImage
          kyc.status
        `,
      })
      .sort({
        startDateTime: 1,
        createdAt: -1,
      })
      .lean();

    const enriched = rawBookings.map((b) => {
      const rawKycStatus = b?.user?.userId?.kyc?.status || "not_submitted";
      const normalizedKyc = normalizeKycStatus(rawKycStatus);
      const startDateTime = new Date(b.startDateTime);
      const endDateTime = new Date(b.endDateTime);
      const holdExpiresAt = b.holdExpiresAt ? new Date(b.holdExpiresAt) : null;
      const startMs = startDateTime.getTime() - now.getTime();
      const endMs = endDateTime.getTime() - now.getTime();
      const holdMs = holdExpiresAt
        ? holdExpiresAt.getTime() - now.getTime()
        : null;

      const resourceWithImage = b.resources?.find(
        (r) =>
          r.resourceId &&
          Array.isArray(r.resourceId.images) &&
          r.resourceId.images.length > 0,
      );

      const resourceImage =
        resourceWithImage?.resourceId?.images?.[0]?.url || null;

      const spaceImage = b.space?.media?.images?.[0]?.url || null;

      return {
        ...b,
        displayImage: resourceImage || spaceImage || null,
        ...withReviewState(b),
        user: {
          ...b.user,
          name: b?.user?.userId?.username || b?.user?.name || "-",
          email: b?.user?.userId?.email || b?.user?.email || "-",
          phoneNumber:
            b?.user?.userId?.phoneNumber || b?.user?.phoneNumber || "-",
          profileImage: b?.user?.userId?.profileImage || null,
          kycStatus: rawKycStatus,
          kycCompleted: isKycCompleted(rawKycStatus),
          kycNormalizedStatus: normalizedKyc,
        },
        timers: {
          startsInMs: startMs,
          endsInMs: endMs,
          holdExpiresInMs: holdMs,
          isUpcoming: startMs > 0,
          isActive: startMs <= 0 && endMs >= 0,
          isExpiredHold:
            b.status === "pending_hold" && holdMs !== null && holdMs <= 0,
        },
      };
    });

    const filteredByKyc =
      kycStatus && kycStatus !== "all"
        ? enriched.filter((b) => matchesKycFilter(b.user?.kycStatus, kycStatus))
        : enriched;

    const stats = {
      totalBookings: enriched.length,
      confirmed: enriched.filter((b) => b.status === "confirmed").length,
      pending: enriched.filter((b) => b.status === "pending").length,
      cancelled: enriched.filter((b) => b.status === "cancelled").length,
      completed: enriched.filter((b) => b.status === "completed").length,
      expired: enriched.filter((b) => b.status === "expired").length,
      upcoming: enriched.filter((b) => new Date(b.startDateTime) > now).length,
      active: enriched.filter(
        (b) =>
          new Date(b.startDateTime) <= now && new Date(b.endDateTime) >= now,
      ).length,
      kycCompleted: enriched.filter((b) => isKycCompleted(b.user?.kycStatus)).length,
      kycNotCompleted: enriched.filter(
        (b) => !isKycCompleted(b.user?.kycStatus),
      ).length,
    };

    const total = filteredByKyc.length;
    const pages = Math.ceil(total / limitNum);
    const start = (pageNum - 1) * limitNum;
    const paginated = filteredByKyc.slice(start, start + limitNum);

    return {
      success: true,
      data: {
        bookings: paginated,
        stats,
        filters: {
          status: status || "all",
          kycStatus: kycStatus || "all",
          paymentStatus: paymentStatus || "all",
          requestedOwnerId: requestedOwnerId || "all",
          spaceId: spaceId || "all",
          startDate: startDate || null,
          endDate: endDate || null,
          upcoming,
          past,
          active,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export const getMyBookings = async (userId, filters = {}) => {
  try {
    const { status, upcoming, past, page = 1, limit = 20 } = filters;

    const query = { "user.userId": userId };

    if (status) query.status = status;
    if (upcoming) query.startDateTime = { $gte: new Date() };
    if (past) query.endDateTime = { $lt: new Date() };

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate({
        path: "space",
        select: "name slug address startingPrice",
        populate: {
          path: "media",
          select: "images video",
        },
      })
      .populate({
        path: "resources.resourceId",
        model: "Resource", // ✅ FIX (VERY IMPORTANT)
        select: "name type images",
      })
      .populate({
        path: "addons.addonId",
        model: "Addon",
        select: "title type images",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // ✅ performance + clean object

    // ✅ FIXED IMAGE LOGIC
    const bookingsWithImage = bookings.map((b) => {
      // 🔥 find first resource that has image
      const resourceWithImage = b.resources?.find(
        (r) =>
          r.resourceId &&
          Array.isArray(r.resourceId.images) &&
          r.resourceId.images.length > 0,
      );

      const resourceImage =
        resourceWithImage?.resourceId?.images?.[0]?.url || null;

      const spaceImage = b.space?.media?.images?.[0]?.url || null;

      return {
        ...b,
        displayImage: resourceImage || spaceImage || null,
        ...withReviewState(b),
      };
    });

    const total = await Booking.countDocuments(query);

    return {
      success: true,
      data: {
        bookings: bookingsWithImage,
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

export const getMyBookingById = async (userId, bookingId) => {
  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      "user.userId": userId,
    })
      .populate("space")
      .populate("user.userId")
      .populate({
        path: "resources.resourceId",
        model: "Resource",
        select: "name type images",
      })
      .populate({
        path: "addons.addonId",
        model: "Addon",
        select: "name type images",
      });

    if (!booking) {
      return { success: false, error: "Booking not found" };
    }

    return { success: true, data: withReviewState(booking.toObject()) };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const cancelMyBooking = async (userId, bookingId, reason = "") => {
  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      "user.userId": userId,
    }).populate("space");

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
      cancelledBy: "user",
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

    if (
      status === "completed" &&
      (booking.paymentStatus === "paid" || booking.payment?.status === "paid") &&
      !booking.reviewSubmitted
    ) {
      booking.reviewNotificationPending = true;
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

    if (
      (booking.paymentStatus === "paid" || booking.payment?.status === "paid") &&
      !booking.reviewSubmitted
    ) {
      booking.reviewNotificationPending = true;
    }

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
    booking.paymentStatus =
      paymentData.status || booking.paymentStatus || booking.payment?.status;

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
