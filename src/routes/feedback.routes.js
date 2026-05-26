import express from "express";
import {
  submitVisitorFeedback,
  submitBookingFeedback,
  getBookingFeedbacks,
  getVisitorFeedbacks,
  triggerReviewReminders,
} from "../controllers/user_controllers/feedback.controller.js";

const router = express.Router();

// Public visitor feedback (fires after 2+ minutes browsing)
router.post("/visitor", submitVisitorFeedback);

// Booking feedback (post-booking quick feedback)
router.post("/booking", submitBookingFeedback);

// Admin/debug endpoints (protected in production by middleware)
router.get("/visitor", getVisitorFeedbacks);
router.get("/booking/:bookingId?", getBookingFeedbacks);

// trigger reminders (should be protected in production)
router.post("/reminders/trigger", triggerReviewReminders);

export default router;
