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

import {
  optionalAuth,
  requireAdminAccess,
  requireAuth,
} from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

const requireLeadOperator = (req, res, next) => {
  if (req.user?.role === "consultant") return next();
  return requireAdminAccess(req, res, next);
};

// Public form submit - anyone can create enquiry, logged-in users are enriched when token exists.
router.post("/", optionalAuth, createEnquiry);

// Super admins see all leads. Owner/admin users are scoped to their spaces and recipients.
router.get("/", requireAuth, requireAdminAccess, getAllEnquiries);
router.post("/bulk-email", requireAuth, requireLeadOperator, sendLeadEmails);
router.get("/:id", requireAuth, requireAdminAccess, getEnquiryById);
router.patch("/:id/status", requireAuth, requireLeadOperator, updateEnquiryStatus);
router.patch("/:id/assign", requireAuth, requireSuperAdmin, assignEnquiryConsultant);
router.post("/:id/notes", requireAuth, requireLeadOperator, addEnquiryNote);
router.post("/:id/call-logs", requireAuth, requireLeadOperator, addCallLog);
router.delete("/:id", requireAuth, requireSuperAdmin, deleteEnquiry);

export default router;
