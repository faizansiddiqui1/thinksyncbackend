import express from "express";
import {
  adminGetVisitRequests,
  createVisitRequest,
  getMyVisitRequests,
  updateVisitRequestStatus,
} from "../controllers/user_controllers/visitRequest.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.post("/", requireAuth, createVisitRequest);
router.get("/me", requireAuth, getMyVisitRequests);

router.get(
  "/admin",
  requireAuth,
  requireAdminAccess,
  requirePermission("leads", "read"),
  adminGetVisitRequests,
);

router.patch(
  "/admin/:id/status",
  requireAuth,
  requireAdminAccess,
  requirePermission("leads", "update"),
  updateVisitRequestStatus,
);

export default router;

