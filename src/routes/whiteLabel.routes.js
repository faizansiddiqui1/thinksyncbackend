import express from "express";

import {
  requestWhiteLabel,
  uploadSecrets,
  getMyWhiteLabelStatus,
  getWhiteLabelSecrets,
} from "../controllers/admin_controllers/whiteLabel.controller.js";

import {
  getWhiteLabelRequests,
  approveWhiteLabel,
  rejectWhiteLabel,
} from "../controllers/super_admin_controllers/whiteLabelApprove.controller.js";

import { requireAuth } from "../middlewares/auth.js";

import {
  canRequestWhiteLabel,
  requireWhiteLabel,
} from "../middlewares/whiteLabel.middleware.js";

import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

/* =========================================================
   ADMIN ROUTES
========================================================= */

// my white-label status
router.get("/me", requireAuth, getMyWhiteLabelStatus);

// request white-label
router.post("/request", requireAuth, canRequestWhiteLabel, requestWhiteLabel);

// get saved credentials access/details
router.get("/secrets", requireAuth, requireWhiteLabel, getWhiteLabelSecrets);

// upload credentials/secrets
router.post("/upload/secret", requireAuth, requireWhiteLabel, uploadSecrets);


/* =========================================================
   SUPER ADMIN ROUTES
========================================================= */

// all requests
router.get("/requests", requireAuth, requireSuperAdmin, getWhiteLabelRequests);

// approve request
router.post("/approve", requireAuth, requireSuperAdmin, approveWhiteLabel);

// reject request
router.post("/reject", requireAuth, requireSuperAdmin, rejectWhiteLabel);

export default router;
