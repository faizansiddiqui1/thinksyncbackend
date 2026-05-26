import Review from "../../models/admin_models/ReviewSchema.js";
import VisitorFeedback from "../../models/user_models/VisitorFeedback.js";
import ErrorLog from "../../models/user_models/ErrorLog.js";
import Space from "../../models/admin_models/Space.js";
import User from "../../models/user_models/User.js";

/**
 * MASTER REVIEWS - Super Admin
 * Get all reviews across the platform with filters
 */
export const getMasterReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20, rating, spaceId, workspace, dateFrom, dateTo, search } = req.query;

    const filters = { status: "approved" };

    if (rating) filters.rating = Number(rating);
    if (spaceId) filters.space = spaceId;
    if (workspace) filters.space = workspace;

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      filters.$or = [
        { review: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Review.countDocuments(filters);
    const reviews = await Review.find(filters)
      .populate("user", "name email phone")
      .populate("space", "name spaceName type")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Hide/Delete review (moderator action)
 */
export const moderateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { action, reason } = req.body; // action: 'hide' | 'delete' | 'approve'

    if (!["hide", "delete", "approve"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action" });
    }

    let review;
    if (action === "delete") {
      review = await Review.findByIdAndDelete(reviewId);
    } else if (action === "hide") {
      review = await Review.findByIdAndUpdate(
        reviewId,
        { status: "rejected", notes: reason || "" },
        { new: true },
      );
    } else {
      review = await Review.findByIdAndUpdate(
        reviewId,
        { status: "approved" },
        { new: true },
      );
    }

    if (!review) {
      return res.status(404).json({ success: false, error: "Review not found" });
    }

    return res.json({ success: true, data: review });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get review details with workspace info
 */
export const getReviewDetail = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await Review.findById(reviewId)
      .populate("user", "name email phone profilePicture")
      .populate("space")
      .populate("booking")
      .lean();

    if (!review) {
      return res.status(404).json({ success: false, error: "Review not found" });
    }

    return res.json({ success: true, data: review });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PLATFORM FEEDBACK - Super Admin
 * Get all visitor feedback with filters
 */
export const getPlatformFeedback = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      issueType,
      deviceType,
      resolved,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const filters = {};

    if (issueType) filters.issueType = issueType;
    if (deviceType) filters.deviceType = deviceType;

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      filters.$or = [
        { feedbackMessage: { $regex: search, $options: "i" } },
        { currentPage: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await VisitorFeedback.countDocuments(filters);
    const feedbacks = await VisitorFeedback.find(filters)
      .populate("user", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      data: {
        feedbacks,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * ERROR LOGS - Super Admin
 * Get all error logs with filters
 */
export const getErrorLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      severity,
      source,
      resolved,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const filters = {};

    if (severity) filters.severity = severity;
    if (source) filters.source = source;
    if (resolved !== undefined) filters.resolved = resolved === "true";

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      filters.$or = [
        { message: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await ErrorLog.countDocuments(filters);
    const errors = await ErrorLog.find(filters)
      .populate("context.userId", "name email")
      .populate("resolvedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      data: {
        errors,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Log error (from frontend or backend)
 */
export const logError = async (req, res) => {
  try {
    const { source, severity, message, code, stackTrace, context } = req.body;

    if (!source || !severity || !message) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const errorLog = await ErrorLog.create({
      source,
      severity,
      message,
      code: code || "",
      stackTrace: stackTrace || "",
      context: {
        ...context,
        ip: req.ip || req.connection.remoteAddress || "",
      },
    });

    return res.status(201).json({ success: true, data: errorLog });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Resolve/mark error as handled
 */
export const resolveError = async (req, res) => {
  try {
    const { errorId } = req.params;
    const { notes } = req.body;

    const errorLog = await ErrorLog.findByIdAndUpdate(
      errorId,
      {
        resolved: true,
        resolvedAt: new Date(),
        notes: notes || "",
      },
      { new: true },
    );

    if (!errorLog) {
      return res.status(404).json({ success: false, error: "Error log not found" });
    }

    return res.json({ success: true, data: errorLog });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
