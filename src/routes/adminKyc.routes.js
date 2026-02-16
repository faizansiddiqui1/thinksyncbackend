import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/auth.js";
import { requireAdminExists } from "../middlewares/admin.js";

import {
  getKycStatus,
  submitKyc,
  approveKyc,
  rejectKyc,
} from "../controllers/admin_controllers/kyc.controller.js";

const router = express.Router();

/**
 * ADMIN (SELF)
 */

router.get("/admin/kyc/status", requireAuth, requireAdminExists, getKycStatus);

router.post("/admin/kyc/submit", requireAuth, requireAdminExists, submitKyc);

/**
 * SUPER ADMIN
 */
router.post(
  "/super-admin/kyc/approve/:adminProfileId",
  requireAuth,
  requireRole("super_admin"),
  approveKyc,
);

router.post(
  "/super-admin/kyc/reject/:adminProfileId",
  requireAuth,
  requireRole("super_admin"),
  rejectKyc,
);

export default router;
