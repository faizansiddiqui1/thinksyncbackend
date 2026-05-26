import express from "express";
import {
  submitVisitorFeedback,
  submitBookingFeedback,
  getBookingFeedbacks,
  getVisitorFeedbacks,
  triggerReviewReminders,
} from "../controllers/user_controllers/feedback.controller.js";
import {
  generalLimiter,
  generalRateLimiter,
} from "../middlewares/rateLimiter.js";
import {
  optionalAuth,
  requireAdminAccess,
  requireAuth,
} from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

// Public visitor feedback (fires after 2+ minutes browsing)
router.post("/visitor", optionalAuth, generalLimiter, submitVisitorFeedback);

// Booking feedback (post-booking quick feedback)
router.post("/booking", requireAuth, generalLimiter, submitBookingFeedback);

// Admin/debug endpoints (protected in production by middleware)
router.get("/visitor", requireAuth, requireAdminAccess, getVisitorFeedbacks);
router.get("/booking/:bookingId?", requireAuth, requireAdminAccess, getBookingFeedbacks);

// trigger reminders (should be protected in production)
router.post(
  "/reminders/trigger",
  requireAuth,
  requireSuperAdmin,
  generalRateLimiter,
  triggerReviewReminders,
);

export default router;
