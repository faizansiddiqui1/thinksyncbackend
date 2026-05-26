import express from "express";
import {
  addResponse,
  createReview,
  deleteReview,
  flagReview,
  getAdminReviews,
  getAdminReviewSummary,
  getMyPendingReviews,
  getReview,
  getSpaceReviews,
  getUserReviews,
  markHelpful,
  moderateReview,
  togglePublish,
  updateReview,
} from "../controllers/user_controllers/review.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import { reviewValidation } from "../middlewares/validations.js";

const router = express.Router();

router.get("/me/pending", requireAuth, getMyPendingReviews);

router.get(
  "/admin/list",
  requireAuth,
  requireAdminAccess,
  requirePermission("review", "read"),
  getAdminReviews,
);

router.get(
  "/admin/summary",
  requireAuth,
  requireAdminAccess,
  requirePermission("review", "read"),
  getAdminReviewSummary,
);

router.post("/", requireAuth, reviewValidation.create, createReview);

router.get("/space/:spaceId", getSpaceReviews);

router.get("/user/:userId", requireAuth, getUserReviews);

router.get("/:id", getReview);

router.put("/:id", requireAuth, updateReview);

router.delete("/:id", requireAuth, deleteReview);

router.post(
  "/:id/response",
  requireAuth,
  requireAdminAccess,
  requirePermission("review", "update"),
  addResponse,
);

router.post("/:id/helpful", requireAuth, markHelpful);

router.post("/:id/flag", requireAuth, flagReview);

router.put(
  "/:id/publish",
  requireAuth,
  requireAdminAccess,
  requirePermission("review", "update"),
  togglePublish,
);

router.patch(
  "/:id/moderation",
  requireAuth,
  requireSuperAdmin,
  moderateReview,
);

export default router;
