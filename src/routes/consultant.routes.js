import express from "express";

import {
  createConsultant,
  createLeadEmailTemplate,
  deleteConsultantProfileImage,
  deleteLeadEmailTemplate,
  getAssignedConsultant,
  getConsultantDashboard,
  getLeadDistribution,
  listConsultantEditRequests,
  listConsultantLeads,
  listConsultants,
  listLeadEmailTemplates,
  previewLeadEmailTemplate,
  reorderConsultants,
  requestConsultantProfileEdit,
  reviewConsultantEditRequest,
  updateConsultant,
  updateLeadEmailTemplate,
} from "../controllers/super_admin_controllers/consultant.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole, requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

// Public routing lookup used by listing cards and details pages.
router.get("/lead-routing/consultant", getAssignedConsultant);

// Super admin consultant and routing management.
router.get("/admin/consultants", requireAuth, requireSuperAdmin, listConsultants);
router.post("/admin/consultants", requireAuth, requireSuperAdmin, createConsultant);
router.patch("/admin/consultants/reorder", requireAuth, requireSuperAdmin, reorderConsultants);
router.patch("/admin/consultants/:id", requireAuth, requireSuperAdmin, updateConsultant);
router.delete(
  "/admin/consultants/:id/profile-image",
  requireAuth,
  requireSuperAdmin,
  deleteConsultantProfileImage,
);

router.get(
  "/admin/consultant-edit-requests",
  requireAuth,
  requireSuperAdmin,
  listConsultantEditRequests,
);
router.patch(
  "/admin/consultant-edit-requests/:id",
  requireAuth,
  requireSuperAdmin,
  reviewConsultantEditRequest,
);

router.get("/admin/lead-distribution", requireAuth, requireSuperAdmin, getLeadDistribution);

// Consultant self-service panel.
router.get(
  "/consultant/dashboard",
  requireAuth,
  requireRole("consultant"),
  getConsultantDashboard,
);

router.get(
  "/consultant/leads",
  requireAuth,
  requireRole("consultant"),
  listConsultantLeads,
);

router.post(
  "/consultant/profile-edit-requests",
  requireAuth,
  requireRole("consultant"),
  requestConsultantProfileEdit,
);

// Shared lead outreach templates.
router.get(
  "/lead-email-templates",
  requireAuth,
  requireRole("consultant", "super_admin"),
  listLeadEmailTemplates,
);
router.post(
  "/lead-email-templates",
  requireAuth,
  requireRole("consultant", "super_admin"),
  createLeadEmailTemplate,
);
router.patch(
  "/lead-email-templates/:id",
  requireAuth,
  requireRole("consultant", "super_admin"),
  updateLeadEmailTemplate,
);
router.delete(
  "/lead-email-templates/:id",
  requireAuth,
  requireRole("consultant", "super_admin"),
  deleteLeadEmailTemplate,
);
router.post(
  "/lead-email-templates/preview",
  requireAuth,
  requireRole("consultant", "super_admin"),
  previewLeadEmailTemplate,
);

export default router;
