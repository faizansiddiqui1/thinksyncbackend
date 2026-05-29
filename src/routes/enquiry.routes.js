// routes/enquiry.routes.js
import express from "express";
import {
  addCallLog,
  addEnquiryNote,
  assignEnquiryConsultant,
  createEnquiry,
  deleteEnquiry,
  getAllEnquiries,
  getEnquiryById,
  sendLeadEmails,
  updateEnquiryStatus,
} from "../controllers/user_controllers/enquiry.controller.js";

import { optionalAuth, requireAuth } from "../middlewares/auth.js";
import { requireRole, requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

// Public form submit - anyone can create enquiry, logged-in users are enriched when token exists.
router.post("/", optionalAuth, createEnquiry);

// Super admin only
router.get("/", requireAuth, requireSuperAdmin, getAllEnquiries);
router.post("/bulk-email", requireAuth, requireRole("super_admin", "consultant"), sendLeadEmails);
router.get("/:id", requireAuth, requireSuperAdmin, getEnquiryById);
router.patch("/:id/status", requireAuth, requireRole("super_admin", "consultant"), updateEnquiryStatus);
router.patch("/:id/assign", requireAuth, requireSuperAdmin, assignEnquiryConsultant);
router.post("/:id/notes", requireAuth, requireRole("super_admin", "consultant"), addEnquiryNote);
router.post("/:id/call-logs", requireAuth, requireRole("super_admin", "consultant"), addCallLog);
router.delete("/:id", requireAuth, requireSuperAdmin, deleteEnquiry);

export default router;
