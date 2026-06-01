import * as bookingService from "../../services/booking.service.js";
import { validationResult } from "express-validator";

import crypto from "crypto";
import TempBooking from "../../models/user_models/TempBooking.js";
import { getTenantIdFromSpace } from "../../utils/getTenantIdFromSpace.js";
import { resolveGateway } from "../../services/paymentGatewayResolver.service.js";
import { finalizeTempBooking } from "../../services/bookingFinalize.service.js";

export const createBooking = async (req, res) => {
  try {

    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }


    const bookingPayload = {
      ...req.body,
      userId: req.user._id,
    };
    const tenantIdOverride =
      req.user?.role === "super_admin"
        ? req.body.tenantId || req.header("X-Tenant-Id") || null
        : null;

    const result = await bookingService.createBooking(
      bookingPayload,
      tenantIdOverride,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createInternalBooking = async (req, res) => {
  try {
    const result = await bookingService.createInternalWorkspaceBooking(
      req.body,
      req.user,
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing payment fields",
      });
    }

    const temp = await TempBooking.findOne({
      orderId: razorpay_order_id,
    });

    if (!temp) {
      console.log("❌ Temp not found for:", razorpay_order_id);
      return res.status(404).json({
        success: false,
        error: "Temp booking not found",
      });
    }

    const bookingUserId =
      temp.bookingData?.user?.userId ||
      temp.bookingData?.userId ||
      null;

    if (
      bookingUserId &&
      String(bookingUserId) !== String(req.user?._id || "")
    ) {
      return res.status(403).json({
        success: false,
        error: "This payment session belongs to another user",
      });
    }

    const tenantId = await getTenantIdFromSpace(temp.bookingData.space);
    const gateway = await resolveGateway(tenantId);

    if (!gateway?.credentials?.keySecret) {
      return res.status(500).json({
        success: false,
        error: "Razorpay secret not configured",
      });
    }

    const secret = gateway.credentials.keySecret;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.log("❌ Signature mismatch");
      return res.status(400).json({
        success: false,
        error: "Invalid signature",
      });
    }

    const result = await finalizeTempBooking({
      orderId: razorpay_order_id,
      gateway: "razorpay",
      paymentInfo: {
        transactionId: razorpay_payment_id,
        reference: razorpay_order_id,
      },
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("❌ verifyRazorpayPayment error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};



export const getOwnerBookings = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === "super_admin";

    const {
      status,
      kycStatus = "all",
      paymentStatus,
      ownerId: requestedOwnerId,
      spaceId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      upcoming,
      past,
      active,
    } = req.query;

    const result = await bookingService.getOwnerBookings(req.user, {
      status,
      kycStatus,
      paymentStatus,
      requestedOwnerId,
      spaceId,
      startDate,
      endDate,
      isSuperAdmin,
      page: Number(page),
      limit: Number(limit),
      upcoming: upcoming === "true",
      past: past === "true",
      active: active === "true",
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};




// Get all user booking by user._id
export const getMyBookings = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      upcoming: req.query.upcoming === "true",
      past: req.query.past === "true",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await bookingService.getMyBookings(req.user._id, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// get user booking by id
export const getMyBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.getMyBookingById(req.user._id, id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getMyCheckoutBooking = async (req, res) => {
  try {
    const result = await bookingService.getCheckoutBooking(
      req.user._id,
      req.params.id,
    );
    return res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const retryMyBookingPayment = async (req, res) => {
  try {
    const result = await bookingService.retryBookingPaymentSession(
      req.user._id,
      req.params.id,
    );
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// cancle user booking by id
export const cancelMyBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await bookingService.cancelMyBooking(
      req.user._id,
      id,
      reason || ""
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};







export const getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.getBookingById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    const filters = {
      status: req.query.status,
      upcoming: req.query.upcoming === "true",
      past: req.query.past === "true",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await bookingService.getUserBookings(userId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getSpaceBookings = async (req, res) => {
  try {
    const { spaceId } = req.params;

    const filters = {
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await bookingService.getSpaceBookings(spaceId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const result = await bookingService.updateBookingStatus(id, status, notes);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy, reason } = req.body;

    if (!cancelledBy) {
      return res.status(400).json({
        success: false,
        error: "cancelledBy is required",
      });
    }

    const result = await bookingService.cancelBooking(id, cancelledBy, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const checkIn = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.checkIn(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const checkOut = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.checkOut(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bookingService.updatePaymentStatus(id, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getBookingStats = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { startDate, endDate } = req.query;

    const result = await bookingService.getBookingStats(
      spaceId,
      startDate,
      endDate,
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
