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

// SAve documets iamges in DB
router.post("/kyc/presign", requireAuth, getPresignForKycImage);
router.post("/kyc/save", requireAuth, saveKycImage);


router.get("/kyc/status", requireAuth, getKycStatus);


// Super admin routes 
router.get("/kyc/admin/status", requireAuth, getAdminKycStatusHandler);

export default router;
