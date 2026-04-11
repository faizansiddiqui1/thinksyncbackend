import express from "express";
import {
  requestWhiteLabel,
  uploadSecrets,
} from "../controllers/admin_controllers/whiteLabel.controller.js";

import { requireAuth } from "../middlewares/auth.js";
import { canRequestWhiteLabel, requireWhiteLabel } from "../middlewares/whiteLabel.middleware.js";
import { approveWhiteLabel } from "../controllers/super_admin_controllers/whiteLabelApprove.controller.js";
import { tenantMiddleware } from "../middlewares/tenant.middleware.js";

const router = express.Router();

// user request
router.post("/request", requireAuth, canRequestWhiteLabel, requestWhiteLabel);


// super admin approve
router.post("/approve", requireAuth, approveWhiteLabel);


// Credentials Manager
router.post("/upload/secret", requireAuth, tenantMiddleware, requireWhiteLabel, uploadSecrets);


export default router;