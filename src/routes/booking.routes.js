console.log("✅ BOOKING ROUTES REGISTERED");
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
  verifyRazorpayPayment,
  getOwnerBookings,
  getMyBookings,
  getMyBookingById,
  cancelMyBooking,
} from "../controllers/user_controllers/booking.controller.js";

import { saveGatewayCredentials } from "../controllers/admin_controllers/payment.controller.js";

import { validateGatewayPayload } from "../middlewares/paymentGateway.validator.js";

import { requireAdminAccess, requireAuth } from "../middlewares/auth.js";
import Booking from "../models/user_models/Booking.js";

const router = express.Router();

router.post("/booking", createBooking);



router.get("/me/bookings", requireAuth, getMyBookings);
router.get("/me/bookings/:id", requireAuth, getMyBookingById);
router.post("/me/bookings/:id/cancel", requireAuth, cancelMyBooking);




router.get("/owner/bookings", requireAuth, requireAdminAccess, getOwnerBookings);


router.post(
  "/credentials",
  // requireAuth,
  // requireAdminAccess,
  validateGatewayPayload,
  saveGatewayCredentials,
);

// /api/payout/
router.post("/razorpay/verify", verifyRazorpayPayment);

router.get("/bookings/:id", getBooking);

router.get("/user/:userId", getUserBookings);

router.get("/space/:spaceId", getSpaceBookings);

router.get("/space/:spaceId/stats", getBookingStats);

router.put("/:id/status", updateBookingStatus);

router.post("/:id/cancel", cancelBooking);

router.post("/:id/check-in", checkIn);

router.post("/:id/check-out", checkOut);

router.put("/:id/payment", updatePaymentStatus);


//  /bookings/space/:spaceId/available?start=2026-03-06&end=2026-03-07
router.get("/space/:spaceId/bookings", async (req, res) => {
  try {
    const { spaceId } = req.params;
    const { resourceId } = req.query;

    const query = {
      space: spaceId,
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "paid",
    };

    if (resourceId) {
      query["resources.resourceId"] = resourceId;
    }

    const bookings = await Booking.find(query)
      .select(
        "bookingType startDateTime endDateTime bookingDuration status quantity payment resource resources",
      )
      .sort({ createdAt: -1 });

    res.json({ success: true, bookings });
  } catch (error) {
    console.error("❌ Fetch bookings error:", error);
    res.status(500).json({ error: error.message });
  }
});



export default router;
