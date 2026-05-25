import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import {
  updateDefaultKycConfig,
  updateGlobalKycConfig,
  updateKycConfig,
} from "../controllers/super_admin_controllers/adminhandle.controller.js";
import { getMarketplaceSnapshot } from "../controllers/super_admin_controllers/marketplace.controller.js";

const router = express.Router();

router.get(
  "/super-admin/marketplace/snapshot",
  requireAuth,
  requireSuperAdmin,
  getMarketplaceSnapshot,
);

router.patch(
  "/super-admin/kyc-config/:adminId",
  requireAuth,
  requireSuperAdmin,
  updateKycConfig,
);

router.patch(
  "/super-admin/global-kyc-config",
  requireAuth,
  requireSuperAdmin,
  updateGlobalKycConfig,
);

router.patch(
  "/super-admin/default-kyc-config",
  requireAuth,
  requireSuperAdmin,
  updateDefaultKycConfig,
);

export default router;
