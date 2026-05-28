import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import {
  getCompanySecurityLogsHandler,
  getCompanySecurityOverviewHandler,
  getMyBookingAccessHandler,
  getSecurityProvidersHandler,
  getSuperAdminSecurityOverviewHandler,
  regenerateMyBookingAccessHandler,
  retestCompanySecurityDeviceHandler,
  saveCompanySecurityDeviceHandler,
  syncCompanySecurityDeviceHandler,
  updateSuperAdminSecurityDeviceStatusHandler,
  validateSecurityAccessAttemptHandler,
} from "../controllers/securityAccess.controller.js";

const router = express.Router();

router.get("/providers", requireAuth, getSecurityProvidersHandler);

router.get("/company/overview", requireAuth, getCompanySecurityOverviewHandler);
router.post("/company/devices", requireAuth, saveCompanySecurityDeviceHandler);
router.patch("/company/devices/:id", requireAuth, saveCompanySecurityDeviceHandler);
router.post(
  "/company/devices/:id/retest",
  requireAuth,
  retestCompanySecurityDeviceHandler,
);
router.post(
  "/company/devices/:id/sync",
  requireAuth,
  syncCompanySecurityDeviceHandler,
);
router.get("/company/logs", requireAuth, getCompanySecurityLogsHandler);

router.get("/my-bookings/:bookingId", requireAuth, getMyBookingAccessHandler);
router.post(
  "/my-bookings/:bookingId/regenerate",
  requireAuth,
  regenerateMyBookingAccessHandler,
);

router.post("/validate", validateSecurityAccessAttemptHandler);

router.get(
  "/super-admin/overview",
  requireAuth,
  requireSuperAdmin,
  getSuperAdminSecurityOverviewHandler,
);
router.patch(
  "/super-admin/devices/:id/status",
  requireAuth,
  requireSuperAdmin,
  updateSuperAdminSecurityDeviceStatusHandler,
);

export default router;
