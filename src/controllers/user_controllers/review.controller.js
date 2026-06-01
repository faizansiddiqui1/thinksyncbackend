import { validationResult } from "express-validator";
import * as reviewService from "../../services/review.service.js";

export const createReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const result = await reviewService.createReview({
      userId: req.user._id,
      bookingId: req.body.bookingId,
      rating: req.body.rating,
      comment: req.body.comment,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getMyPendingReviews = async (req, res) => {
  try {
    const result = await reviewService.getPendingReviewPrompts(req.user._id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getReview = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.getReviewById(id);

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

export const getSpaceReviews = async (req, res) => {
  try {
    const { spaceId } = req.params;

    const filters = {
      rating: req.query.rating ? Number(req.query.rating) : null,
      verifiedOnly: req.query.verifiedOnly === "true",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sortBy: req.query.sortBy || "createdAt",
    };

    const result = await reviewService.getSpaceReviews(spaceId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;

    const isOwnProfile = req.user?._id?.toString() === userId;
    const isAdmin = req.user?.role === "super_admin";

    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized to view these reviews",
      });
    }

    const filters = {
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
    };

    const result = await reviewService.getUserReviews(userId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getAdminReviews = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || "",
      spaceId: req.query.spaceId || "",
      rating: req.query.rating ? Number(req.query.rating) : null,
      visibility: req.query.visibility || "all",
      responseStatus: req.query.responseStatus || "all",
      flagged: req.query.flagged === "true",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
      sortBy: req.query.sortBy || "createdAt",
      sortDirection: req.query.sortDirection || "desc",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 10,
    };

    const result = await reviewService.getAdminReviews(req.user, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getAdminReviewSummary = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || "",
      spaceId: req.query.spaceId || "",
      rating: req.query.rating ? Number(req.query.rating) : null,
      visibility: req.query.visibility || "all",
      responseStatus: req.query.responseStatus || "all",
      flagged: req.query.flagged === "true",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
    };

    const result = await reviewService.getAdminReviewSummary(req.user, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await reviewService.updateReview(id, req.user._id, req.body);

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

export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === "super_admin";

    const result = await reviewService.deleteReview(
      id,
      req.user._id,
      isAdmin,
    );

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

export const addResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.addResponse(
      id,
      req.body,
      req.user?._id || null,
    );

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

export const markHelpful = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.markHelpful(id, req.user._id);

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

export const flagReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await reviewService.flagReview(id, reason);

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

export const togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.togglePublish(
      id,
      typeof req.body?.isPublished === "boolean"
        ? req.body.isPublished
        : undefined,
    );

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

export const moderateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.moderateReview(id, req.body || {});

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
