// routes/booking.routes.js (demo GET for listings integration)
import express from "express";
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
  updatePaymentStatus,
} from "../controllers/user_controllers/booking.controller.js";
import { cashfreeWebhook } from "../controllers/user_controllers/cashfreeWebhook.controller.js";

const router = express.Router();

router.post("/booking", createBooking);

router.get("/:id", getBooking);

router.get("/user/:userId", getUserBookings);

router.get("/space/:spaceId", getSpaceBookings);

router.get("/space/:spaceId/stats", getBookingStats);

router.put("/:id/status", updateBookingStatus);

router.post("/:id/cancel", cancelBooking);

router.post("/:id/check-in", checkIn);

router.post("/:id/check-out", checkOut);

router.put("/:id/payment", updatePaymentStatus);

// Demo GET: /bookings/space/:spaceId/available?start=2026-03-06&end=2026-03-07
router.get("/space/:spaceId/available", async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { start, end } = req.query;
    const hasOverlap = await Booking.checkOverlap(
      spaceId,
      new Date(start),
      new Date(end),
    );
    res.json({ available: !hasOverlap, spaceId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
