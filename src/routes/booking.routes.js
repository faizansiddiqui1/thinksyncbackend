import express from 'express';
import {
  createBooking,
  getBooking,
  getUserBookings,
  getSpaceBookings,
  getBookingStats,
  updateBookingStatus,
  cancelBooking,
  checkIn,
  checkOut,
  updatePaymentStatus
} from '../controllers/booking.controller.js';

import { bookingValidation } from '../middleware/validation.js';

const router = express.Router();

/* =========================
   Booking Routes
========================= */

router.post('/', bookingValidation.create, createBooking);

router.get('/:id', getBooking);

router.get('/user/:userId', getUserBookings);

router.get('/space/:spaceId', getSpaceBookings);

router.get('/space/:spaceId/stats', getBookingStats);

router.put('/:id/status', updateBookingStatus);

router.post('/:id/cancel', cancelBooking);

router.post('/:id/check-in', checkIn);

router.post('/:id/check-out', checkOut);

router.put('/:id/payment', updatePaymentStatus);

export default router;
