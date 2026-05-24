import express from "express";
import {
  verifyPanHandler,
  verifyGstHandler,
  verifyCinHandler,
  verifyAadhaarOCRHandler,
  verifyBankSyncHandler,
  getPresignForKycImage,
  saveKycImage,
  getKycStatus,
  getAdminKycDecision,
  getAdminKycStatusHandler,
  verifyCompanyPanHandler,
  getUserKycStatusForAdmin,
  verifyPanForUser,
  verifyCompanyPanForUser,
  verifyGstForUser,
  verifyCinForUser,
  verifyAadhaarOCRForUser,
  verifyBankSyncForUser,
  saveKycImageForUser,
} from "../controllers/admin_controllers/verification.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });

// PAN
router.post("/verification/pan", requireAuth, verifyPanHandler);

// Company pan
router.post("/verification/company-pan", requireAuth, verifyCompanyPanHandler);

// GST
router.post("/verification/gst", requireAuth, verifyGstHandler);

// CIN
router.post("/verification/cin", requireAuth, verifyCinHandler);

// Bank (sync & async)
router.post("/verification/bank/sync", requireAuth, verifyBankSyncHandler);

// Aadhaar
router.post(
  "/verification/aadhaar/ocr",
  requireAuth,
  upload.single("file"),
  verifyAadhaarOCRHandler,
);

// Save documets iamges in DB
router.post("/kyc/presign", requireAuth, getPresignForKycImage);
router.post("/kyc/save", requireAuth, saveKycImage);

router.get("/kyc/status", requireAuth, getKycStatus);

// Super admin routes
router.get("/kyc/admin/status", requireAuth, getAdminKycStatusHandler);

// Admin review routes for target user KYC
router.get(
  "/admin/users/:userId/kyc/status",
  requireAuth,
  getUserKycStatusForAdmin,
);
router.post("/admin/users/:userId/verification/pan", requireAuth, verifyPanForUser);
router.post(
  "/admin/users/:userId/verification/company-pan",
  requireAuth,
  verifyCompanyPanForUser,
);
router.post("/admin/users/:userId/verification/gst", requireAuth, verifyGstForUser);
router.post("/admin/users/:userId/verification/cin", requireAuth, verifyCinForUser);
router.post(
  "/admin/users/:userId/verification/bank/sync",
  requireAuth,
  verifyBankSyncForUser,
);
router.post(
  "/admin/users/:userId/verification/aadhaar/ocr",
  requireAuth,
  upload.single("file"),
  verifyAadhaarOCRForUser,
);
router.post(
  "/admin/users/:userId/kyc/save",
  requireAuth,
  saveKycImageForUser,
);

export default router;
