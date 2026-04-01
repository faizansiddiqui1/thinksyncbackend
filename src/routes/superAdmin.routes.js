// requireSuperAdmin.routes.js

import express from "express";
import { requireAuth } from "../middlewares/auth";
import { requireSuperAdmin } from "../middlewares/superadmin";
import { updateDefaultKycConfig, updateGlobalKycConfig, updateKycConfig } from "../controllers/super_admin_controllers/adminhandle.controller.js";


const router = express.Router();

// Edit config by admin id specifig admin config by super admin
router.patch(
  "/super-admin/kyc-config/:adminId",
  requireAuth,
  requireSuperAdmin,
  updateKycConfig,
);

// update all existing admin config by super admin
router.patch(
  "/super-admin/global-kyc-config",
  requireAuth,
  requireSuperAdmin,
  updateGlobalKycConfig
);

// Set default config for upcoming admins
router.patch(
    "/super-admin/default-kyc-config",
    requireAuth,
    requireSuperAdmin,
    updateDefaultKycConfig
)

