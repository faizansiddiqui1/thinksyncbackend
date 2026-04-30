// routes/enquiry.routes.js
import express from "express";
import {
  createEnquiry,
  getAllEnquiries,
  getEnquiryById,
  updateEnquiryStatus,
  deleteEnquiry,
} from "../controllers/user_controllers/enquiry.controller.js";

import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

// Public form submit — anyone can create enquiry
router.post("/", createEnquiry);

// Super admin only
router.get("/", requireAuth, requireSuperAdmin, getAllEnquiries);
router.get("/:id", requireAuth, requireSuperAdmin, getEnquiryById);
router.patch("/:id/status", requireAuth, requireSuperAdmin, updateEnquiryStatus);
router.delete("/:id", requireAuth, requireSuperAdmin, deleteEnquiry);

export default router;