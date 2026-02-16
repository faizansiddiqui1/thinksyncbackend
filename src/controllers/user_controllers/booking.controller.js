import bookingService from '../services/bookingService.js';
import { validationResult } from 'express-validator';

export const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const result = await bookingService.createBooking(req.body);
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
      error: error.message
    });
  }
};

export const getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    const filters = {
      status: req.query.status,
      upcoming: req.query.upcoming === 'true',
      past: req.query.past === 'true',
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 20
    };

    const result = await bookingService.getUserBookings(userId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
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
      limit: req.query.limit ? Number(req.query.limit) : 20
    };

    const result = await bookingService.getSpaceBookings(spaceId, filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
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
        error: 'Status is required'
      });
    }

    const result = await bookingService.updateBookingStatus(
      id,
      status,
      notes
    );

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

export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy, reason } = req.body;

    if (!cancelledBy) {
      return res.status(400).json({
        success: false,
        error: 'cancelledBy is required'
      });
    }

    const result = await bookingService.cancelBooking(
      id,
      cancelledBy,
      reason
    );

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
      error: error.message
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
      error: error.message
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
      error: error.message
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
      endDate
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
