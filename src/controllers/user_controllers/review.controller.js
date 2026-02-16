import reviewService from '../services/reviewService.js';
import { validationResult } from 'express-validator';

export const createReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const result = await reviewService.createReview(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
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
      error: error.message
    });
  }
};

export const getSpaceReviews = async (req, res) => {
  try {
    const { spaceId } = req.params;

    const filters = {
      rating: req.query.rating ? Number(req.query.rating) : null,
      verifiedOnly: req.query.verifiedOnly === 'true',
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20,
      sortBy: req.query.sortBy || 'createdAt'
    };

    const result = await reviewService.getSpaceReviews(spaceId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;

    const filters = {
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20
    };

    const result = await reviewService.getUserReviews(userId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await reviewService.updateReview(id, userId, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, isAdmin } = req.body;

    const result = await reviewService.deleteReview(id, userId, isAdmin);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const addResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.addResponse(id, req.body);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const markHelpful = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await reviewService.markHelpful(id, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
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
      error: error.message
    });
  }
};

export const togglePublish = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await reviewService.togglePublish(id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
