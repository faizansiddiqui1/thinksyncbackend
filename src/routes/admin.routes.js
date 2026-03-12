// routes/admin.js (naya ya existing ko replace)
import express from "express";
import {
  requireAuth,
  requireAdminAccess,
  requirePermission,
  loadAdminProfile,
} from "../middlewares/auth.js";

// Controllers (adjust paths)
import {
  getAdminProfile,
  submitKyc,
  approveKyc,
  rejectKyc,
} from "../controllers/admin_controllers/kyc.controller.js";

import * as roleController from "../controllers/super_admin_controllers/role.controller.js";

const router = express.Router();

// ────────────────────────────────────────────────
// Profile & KYC Routes
// ────────────────────────────────────────────────
router.get("/profile", requireAuth, loadAdminProfile, getAdminProfile);

router.post("/kyc/submit", requireAuth, loadAdminProfile, submitKyc);

// Approve/Reject – super admin only (ya custom permission 'kyc_review')
router.post(
  "/kyc/approve/:adminProfileId",
  requireAuth,
  requireAdminAccess,
  requirePermission("kyc", "review"),
  approveKyc,
);

router.post(
  "/kyc/reject/:adminProfileId",
  requireAuth,
  requireAdminAccess,
  requirePermission("kyc", "review"),
  rejectKyc,
);

// ────────────────────────────────────────────────
// Role Management Routes (super admin heavy)
// ────────────────────────────────────────────────
router.post(
  "/roles/create",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "create"),
  roleController.createRole,
);

router.post(
  "/roles/assign",
  requireAuth,
  requireAdminAccess,
  requirePermission("roles", "assign"),
  roleController.assignRole,
);

router.get(
  "/roles",
  requireAuth,
  requireAdminAccess,
  requirePermission("roles", "read"),
  roleController.getAllRoles,
);

router.get(
  "/roles/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("roles", "read"),
  roleController.getRoleById,
);

router.get(
  "/assigned/roles",
  requireAuth,
  requireAdminAccess,
  roleController.getAssignedRoles,
);
 
router.post(
  "/roles/remove",
  requireAuth,
  requireAdminAccess,
  roleController.removeRoleFromUser,
);

router.put(
  "/roles/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("roles", "update"),
  roleController.updateRole,
);

router.delete(
  "/roles/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("roles", "delete"),
  roleController.deleteRole,
);

export default router;
