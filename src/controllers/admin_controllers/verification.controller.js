import AdminProfile from "../../models/admin_models/AdminProfile.js";
import CompanyVerification from "../../models/admin_models/CompanyVerification.js";
import User from "../../models/user_models/User.js";
import * as svc from "../../services/verification.service.js";
import { ApiError } from "../../utils/apiResponse.js";

/** ensure nested object exists */
export function ensureField(obj, field) {
  if (!obj[field]) obj[field] = {};
}

function normalizeConfig(cfg = {}) {
  const bool = (v) => v === true || v === "true";

  return {
    requirePan: bool(cfg.requirePan),
    requireCompanyPan: bool(cfg.requireCompanyPan),
    requireGstin: bool(cfg.requireGstin),
    requireCin: bool(cfg.requireCin),
    requireBankCheack: bool(cfg.requireBankCheack),
    requireFaceMatch: bool(cfg.requireFaceMatch),
    requireAadhaar: bool(cfg.requireAadhaar),
  };
}

async function getGlobalKycConfig() {
  const global = await AdminProfile.findOne({
    "company.name": "GLOBAL_DEFAULT",
  }).lean();

  // console.log("GLOBAL DOC:", global); // DEBUG

  if (!global?.kyc?.config) {
    console.log("⚠️ Global config missing");
    return {};
  }

  return global.kyc.config;
}

export async function getAdminKycStatusHandler(req, res) {
  try {
    let user = await User.findById(req.user._id).populate({
      path: "customRoles",
      select: "name permissions",
    });

    const cv = await CompanyVerification.findOne({ userId: user._id });
    const adminProfile = await AdminProfile.findOne({ owner: user._id });

    const rawConfig = await getGlobalKycConfig();
    const config = normalizeConfig(rawConfig);

    if (!adminProfile) {
      return res.json({
        success: true,
        role: user.role,
        customRoles: user.customRoles || [],
        config,
        details: cv || {},
        status: "not_submitted",
      });
    }

    const decision = getAdminKycDecision(cv, config, user);

    // ✅🔥 MAIN FIX (role sync)
    if (decision === "approved" && user.role !== "admin") {
      user.role = "admin";
      user.kyc.status = "approved";
      await user.save();

      // fresh role send karne ke liye update
      user = user.toObject();
      user.role = "admin";
    }

    const userKycStatus = await svc.buildUserKycPayload(user._id);

    return res.json({
      success: true,
      role: user.role, // ✅ ab correct aayega
      customRoles: user.customRoles || [],
      status: decision,
      config,
      reviewedAt: adminProfile.kyc.reviewedAt,
      details: cv || {},
      userKycStatus,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// ===================================================
// get Admin KYC status
// ===================================================
export function getAdminKycDecision(companyVerification, config = {}, user) {
  if (!companyVerification) return "pending";

  const checks = [];

  if (config.requirePan)
    checks.push(companyVerification?.pan?.status === "verified");

  // company pan (new)
  if (config.requireCompanyPan)
    checks.push(companyVerification?.companyPan?.status === "verified");

  // Aadhaar presence/verification
  if (config.requireAadhaar || config.requireFaceMatch)
    checks.push(companyVerification?.aadhaar?.status === "verified");

  if (config.requireBankCheack)
    checks.push(companyVerification?.bank?.status === "verified");

  if (config.requireGstin)
    checks.push(companyVerification?.gst?.status === "verified");

  if (config.requireCin)
    checks.push(companyVerification?.cin?.status === "verified");

  // if any explicit check is false -> pending
  if (checks.includes(false)) return "pending";

  return "approved";
}

export async function updateAdminKyc(userId) {
  const cv = await CompanyVerification.findOne({ userId });
  const adminProfile = await AdminProfile.findOne({ owner: userId });

  if (!adminProfile) return;

  const rawConfig = await getGlobalKycConfig();
  const config = normalizeConfig(rawConfig);

  // fetch user so faceMatch check can run
  const user = await User.findById(userId).lean();

  const decision = getAdminKycDecision(cv, config, user);

  adminProfile.kyc.status = decision;
  adminProfile.kyc.reviewedAt = new Date();
  await adminProfile.save();

  const u = await User.findById(userId);
  if (u) {
    u.role = decision === "approved" ? "admin" : "pending_admin";
    u.kyc.status = decision === "approved" ? "approved" : "pending";
    await u.save();
  }
}
/** get or create verification row */
export async function getOrCreate(userId) {
  let v = await CompanyVerification.findOne({ userId });
  if (!v) v = new CompanyVerification({ userId });
  return v;
}

// is already verifed ?
export function isAlreadyVerified(doc, newValue, keyName = "number") {
  if (!doc) return false;

  if (
    doc.status === "verified" &&
    doc.data &&
    doc.data[keyName] &&
    doc.data[keyName] === newValue
  ) {
    return true;
  }

  return false;
}

/** PAN */
export async function verifyPanHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "PAN is required");

    const v = await getOrCreate(userId);

    // ✅ CHECK BEFORE API CALL
    if (v.pan?.status === "verified" && v.pan?.data?.pan === pan) {
      return res.json({
        success: true,
        message: "Your PAN already verified",
        verified: true,
        status: v.pan.status, // we don't want to send full data
      });
    }

    const { raw, verified } = await svc.verifyPan(pan, name);

    ensureField(v, "pan");
    v.pan.status = verified ? "verified" : "rejected";
    v.pan.data = raw;

    await v.save();

    //
    const user = await User.findById(userId);
    if (user) {
      if (!user.kyc) user.kyc = {};

      user.kyc.pan = {
        status: verified ? "verified" : "rejected",
        data: raw,
        uploadedAt: new Date(),
      };

      user.kyc.status = await svc.getFinalKycStatus(user); // or set from buildUserKycPayload
      await user.save();
    }

    //

    await updateAdminKyc(userId);

    // ✅ FIX HERE
    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Please enter correct Individual PAN number",
      });
    }

    return res.json({
      success: true,
      message: "PAN verification completed",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

// Company pan
export async function verifyCompanyPanHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "Company PAN required");

    const v = await getOrCreate(userId);

    // Normalize input
    const panInput = String(pan).trim().toUpperCase();

    // Duplicate check: check v.companyPan first, then fallback to v.pan (legacy)
    const existingCompanyPan =
      v.companyPan?.status === "verified"
        ? v.companyPan?.data?.pan || v.companyPan?.data
        : null;
    const existingPersonalPan =
      v.pan?.status === "verified" ? v.pan?.data?.pan || v.pan?.data : null;

    if (
      existingCompanyPan &&
      String(existingCompanyPan).toUpperCase() === panInput
    ) {
      return res.json({
        success: true,
        message: "Company PAN already verified",
        verified: true,
      });
    }

    const { raw, verified } = await svc.verifyCompanyPan(panInput, name);

    ensureField(v, "companyPan");
    v.companyPan.status = verified ? "verified" : "rejected";
    v.companyPan.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Company PAN verification completed",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

/** GST */
export async function verifyGstHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const { gstin } = req.body;

    if (!gstin) throw new ApiError(400, "GSTIN is required");

    const v = await getOrCreate(userId);

    if (v.gst?.status === "verified" && v.gst?.data?.GSTIN === gstin) {
      return res.json({
        success: true,
        message: "Your GST already verified",
        verified: true,
        data: v.gst.status,
      });
    }

    const { raw, verified } = await svc.verifyGstin(gstin);

    ensureField(v, "gst");
    v.gst.status = verified ? "verified" : "rejected";
    v.gst.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    // ✅ FIX — wrong GST pe error bhejo
    if (!verified) {
      return res.status(400).json({
        success: false,
        message: raw?.message || "Invalid GST number",
      });
    }

    return res.json({
      success: true,
      message: "GST verification completed",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

/** CIN */
export async function verifyCinHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const { cin } = req.body;

    if (!cin) throw new ApiError(400, "CIN is required");

    const v = await getOrCreate(userId);

    if (v.cin?.status === "verified" && v.cin?.data?.cin === cin) {
      return res.json({
        success: true,
        message: "Your CIN already verified",
        verified: true,
        data: v.cin.status,
      });
    }
    const { raw, verified } = await svc.verifyCin(cin);

    ensureField(v, "cin");
    v.cin.status = verified ? "verified" : "rejected";
    v.cin.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    // ✅ MAIN FIX
    if (!verified) {
      return res.status(400).json({
        success: false,
        message: raw?.message || "Invalid CIN number",
      });
    }

    return res.json({
      success: true,
      message: "CIN verification completed",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

/** Aadhaar OCR */
export async function verifyAadhaarOCRHandler(req, res, next) {
  try {
    const userId = req.user && req.user._id;
    const file = req.file;
    const fileUrl = req.body.fileUrl || req.body.file_url;

    if (!file && !fileUrl) {
      throw new ApiError(400, "Aadhaar file or fileUrl required");
    }

    const v = await getOrCreate(userId);

    let raw, verified;

    if (file) {
      const input = {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      };

      ({ raw, verified } = await svc.verifyAadhaarOCR(input));
    } else {
      ({ raw, verified } = await svc.verifyAadhaarOCR(fileUrl));
    }

    ensureField(v, "aadhaar");
    v.aadhaar.status = verified ? "verified" : "rejected";
    v.aadhaar.data = raw;

    await v.save();

    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Aadhaar verification completed",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

/** BANK SYNC */
export async function verifyBankSyncHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const { bank_account, ifsc } = req.body;

    if (!bank_account || !ifsc)
      throw new ApiError(400, "bank_account number and IFSC required");

    const v = await getOrCreate(userId);

    // ✅ DUPLICATE CHECK (correct now)
    if (
      v.bank?.status === "verified" &&
      v.bank?.account === bank_account &&
      v.bank?.ifsc === ifsc
    ) {
      return res.json({
        success: true,
        message: "Your bank already verified",
        verified: true,
        data: v.bank.data,
      });
    }

    // 🔵 CALL PROVIDER
    const { raw, verified } = await svc.verifyBankSync(bank_account, ifsc);

    ensureField(v, "bank");

    // ✅ SAVE WITH OWN FIELDS
    v.bank.status = verified ? "verified" : "rejected";
    v.bank.account = bank_account;
    v.bank.ifsc = ifsc;
    v.bank.data = raw;
    v.bank.verifiedAt = new Date();

    await v.save();
    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Bank verification completed",
      verified,
      bank_account,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

export const getPresignForKycImage = async (req, res) => {
  try {
    const data = await svc.getPresignForKycImage(req.user.id, req.body);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const saveKycImage = async (req, res) => {
  try {
    const data = await svc.saveKycImage(req.user.id, {
      key: req.body.key,
      type: req.body.type,
    });

    res.json({ success: true, message: "Image saved", data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getKycStatus = async (req, res) => {
  try {
    const data = await svc.buildUserKycPayload(req.user._id);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
