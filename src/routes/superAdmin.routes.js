import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import {
  updateDefaultKycConfig,
  updateGlobalKycConfig,
  updateKycConfig,
} from "../controllers/super_admin_controllers/adminhandle.controller.js";
import { getMarketplaceSnapshot } from "../controllers/super_admin_controllers/marketplace.controller.js";
import {
  getPlatformConfigAuditLog,
  getPlatformConfigs,
  resetPlatformConfigOverride,
  savePlatformConfigs,
  togglePlatformConfig,
} from "../controllers/super_admin_controllers/platformConfig.controller.js";

const router = express.Router();

router.get(
  "/super-admin/marketplace/snapshot",
  requireAuth,
  requireSuperAdmin,
  getMarketplaceSnapshot,
);

router.get(
  "/super-admin/platform-configs",
  requireAuth,
  requireSuperAdmin,
  getPlatformConfigs,
);

router.get(
  "/super-admin/platform-configs/audit",
  requireAuth,
  requireSuperAdmin,
  getPlatformConfigAuditLog,
);

router.patch(
  "/super-admin/platform-configs",
  requireAuth,
  requireSuperAdmin,
  savePlatformConfigs,
);

router.patch(
  "/super-admin/platform-configs/:key/status",
  requireAuth,
  requireSuperAdmin,
  togglePlatformConfig,
);

router.delete(
  "/super-admin/platform-configs/:key",
  requireAuth,
  requireSuperAdmin,
  resetPlatformConfigOverride,
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
