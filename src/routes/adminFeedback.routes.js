import express from "express";
import {
  getMasterReviews,
  moderateReview,
  getReviewDetail,
  getPlatformFeedback,
  getErrorLogs,
  logError,
  resolveError,
} from "../controllers/user_controllers/adminFeedback.controller.js";

const router = express.Router();

/**
 * MASTER REVIEWS (Super Admin only)
 */
router.get("/master-reviews", getMasterReviews);
router.get("/reviews/:reviewId", getReviewDetail);
router.put("/reviews/:reviewId/moderate", moderateReview);

/**
 * PLATFORM FEEDBACK (Super Admin only)
 */
router.get("/platform-feedback", getPlatformFeedback);

/**
 * ERROR LOGS
 */
router.get("/error-logs", getErrorLogs);
router.post("/error-logs", logError); // Public endpoint for frontend/backend to report errors
router.put("/error-logs/:errorId/resolve", resolveError); // Super admin only

export default router;
