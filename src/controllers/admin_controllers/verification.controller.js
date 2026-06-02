import AdminProfile from "../../models/admin_models/AdminProfile.js";
import CompanyVerification from "../../models/admin_models/CompanyVerification.js";
import User from "../../models/user_models/User.js";
import * as svc from "../../services/verification.service.js";
import { ApiError } from "../../utils/apiResponse.js";

import Company from "../../models/super_admin_models/Company.model.js";
import { getGlobalKycConfig as getStoredGlobalKycConfig } from "../../services/globalKycConfig.service.js";

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

function getContext(req) {
  return req.context || {};
}

function getTenant(req) {
  return getContext(req).tenant || null;
}

async function getSelfHealingGlobalKycConfig() {
  return getStoredGlobalKycConfig();
}

async function getGlobalKycConfig() {
  const global = await AdminProfile.findOne({
    "company.name": "GLOBAL_DEFAULT",
  }).lean();

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

    const companyRecord = user.companyId
      ? await Company.findById(user.companyId).populate([
          {
            path: "assignedSpaceId",
            select: "name slug spaceType",
          },
          {
            path: "spaces",
            select: "name slug spaceType",
          },
          {
            path: "employees.user",
            select: "username email phoneNumber",
          },
        ])
      : null;

    const company = companyRecord?.toObject?.() || companyRecord || null;

    // 🔥 FIXED accountType
    let accountType = "user";
    let isCompanyAdmin = false;
    let isEmployee = false;

    if (user.role === "super_admin") {
      accountType = "super_admin";
    } else if (user.role === "consultant") {
      accountType = "consultant";
    } else if (company?.owner?.toString() === user._id.toString()) {
      accountType = "company_admin";
      isCompanyAdmin = true;
    } else if (
      company?.employees?.some(
        (employee) =>
          String(employee?.user?._id || employee?.user) === String(user._id),
      )
    ) {
      accountType = "employee";
      isEmployee = true;
    } else if (user.role === "admin") {
      accountType = "admin";
    }

    const rawConfig = await getSelfHealingGlobalKycConfig();
    const config = normalizeConfig(rawConfig);

    const userKycStatus = await svc.buildUserKycPayload(user._id);
    const ownerAdminProfile =
      company?.owner && String(company.owner) !== String(user._id)
        ? await AdminProfile.findOne({ owner: company.owner }).lean()
        : adminProfile?.toObject?.() || adminProfile || null;

    const assignedSpaces = [
      company?.assignedSpaceId,
      ...(Array.isArray(company?.spaces) ? company.spaces : []),
    ].filter(Boolean);

    const primaryWorkspace =
      assignedSpaces.find((space) => space?.slug) || company?.assignedSpaceId || null;

    const workspaceHome = primaryWorkspace?.slug
      ? `/space/${primaryWorkspace.slug}`
      : null;

    const workspaceAccess = {
      hasAssignedWorkspace: Boolean(primaryWorkspace),
      canManageAssignedSpaces: Boolean(isCompanyAdmin || isEmployee),
      allowedSpaceIds: assignedSpaces
        .map((space) => space?._id || space?.id || space)
        .filter(Boolean),
    };

    const whiteLabel = ownerAdminProfile?.whiteLabel || {
      status: "none",
      request: {},
      domain: {},
      permissions: {},
      marketplaceMode: "marketplace",
    };

    const branding = {
      companyName:
        company?.displayName ||
        company?.legalName ||
        ownerAdminProfile?.company?.name ||
        null,
      requestedBrandName:
        whiteLabel?.request?.businessName ||
        ownerAdminProfile?.company?.name ||
        null,
      logoKey: ownerAdminProfile?.company?.placeholderImageKey || null,
      logoUrl: null,
      activeDomain: whiteLabel?.domain?.activeDomain || null,
      customBrandingEnabled: Boolean(
        whiteLabel?.permissions?.customBranding,
      ),
    };
    const securityAccessEnabled =
      whiteLabel?.status === "approved" &&
      whiteLabel?.request?.needsHardwareAccess === true;

    // 🔥 COMMON RESPONSE BASE
    const baseResponse = {
      success: true,
      role: user.role,

      accountType,
      isCompanyAdmin,
      isEmployee,
      companyId: user.companyId || null,
      company,
      workspaceAccess,
      workspaceHome,
      whiteLabel,
      securityAccessEnabled,
      branding,

      customRoles: user.customRoles || [],
      config,
      details: cv || {},
      reviewedAt: adminProfile?.kyc?.reviewedAt || null,
      userKycStatus,
    };

    if (!adminProfile) {
      return res.json({
        ...baseResponse,
        status: "not_submitted",
      });
    }

    const decision = getAdminKycDecision(cv, config, user);

    if (decision === "approved" && user.role !== "admin") {
      user.role = "admin";
      user.kyc.status = "approved";
      await user.save();
    }

    return res.json({
      ...baseResponse,
      status: decision,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

function ensureTargetUserId(req) {
  const { userId } = req.params;
  if (!userId) {
    throw new ApiError(400, "Target userId is required");
  }
  return userId;
}

export async function getUserKycStatusForAdmin(req, res) {
  try {
    const userId = ensureTargetUserId(req);
    const data = await svc.buildUserKycPayload(userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export function getAdminKycDecision(companyVerification, config = {}, user) {
  if (!companyVerification) return "pending";

  const checks = [];

  if (config.requirePan) {
    checks.push(companyVerification?.pan?.status === "verified");
  }

  if (config.requireCompanyPan) {
    checks.push(companyVerification?.companyPan?.status === "verified");
  }

  if (config.requireAadhaar || config.requireFaceMatch) {
    checks.push(companyVerification?.aadhaar?.status === "verified");
  }

  if (config.requireBankCheack) {
    checks.push(companyVerification?.bank?.status === "verified");
  }

  if (config.requireGstin) {
    checks.push(companyVerification?.gst?.status === "verified");
  }

  if (config.requireCin) {
    checks.push(companyVerification?.cin?.status === "verified");
  }

  if (checks.includes(false)) return "pending";

  return "approved";
}

export async function updateAdminKyc(userId) {
  const cv = await CompanyVerification.findOne({ userId });
  const adminProfile = await AdminProfile.findOne({ owner: userId });

  if (!adminProfile) return;

  const rawConfig = await getSelfHealingGlobalKycConfig();
  const config = normalizeConfig(rawConfig);

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

export async function verifyPanHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const tenant = getTenant(req);
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "PAN is required");

    const v = await getOrCreate(userId);

    if (v.pan?.status === "verified" && v.pan?.data?.pan === pan) {
      return res.json({
        success: true,
        message: "Your PAN already verified",
        verified: true,
        status: v.pan.status,
      });
    }

    const { raw, verified } = await svc.verifyPan({
      tenant,
      pan,
      name,
    });

    ensureField(v, "pan");
    v.pan.status = verified ? "verified" : "rejected";
    v.pan.data = raw;

    await v.save();

    const user = await User.findById(userId);
    if (user) {
      if (!user.kyc) user.kyc = {};

      user.kyc.pan = {
        status: verified ? "verified" : "rejected",
        data: raw,
        uploadedAt: new Date(),
      };

      user.kyc.status = await svc.getFinalKycStatus(user);
      await user.save();
    }

    await updateAdminKyc(userId);

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

export async function verifyPanForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "PAN is required");

    const v = await getOrCreate(userId);

    if (v.pan?.status === "verified" && v.pan?.data?.pan === pan) {
      return res.json({
        success: true,
        message: "PAN already verified for target user",
        verified: true,
        status: v.pan.status,
      });
    }

    const { raw, verified } = await svc.verifyPan({
      tenant,
      pan,
      name,
    });

    ensureField(v, "pan");
    v.pan.status = verified ? "verified" : "rejected";
    v.pan.data = raw;

    await v.save();

    const user = await User.findById(userId);
    if (user) {
      if (!user.kyc) user.kyc = {};

      user.kyc.pan = {
        status: verified ? "verified" : "rejected",
        data: raw,
        uploadedAt: new Date(),
      };

      user.kyc.status = await svc.getFinalKycStatus(user);
      await user.save();
    }

    await updateAdminKyc(userId);

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Please enter correct Individual PAN number",
      });
    }

    return res.json({
      success: true,
      message: "PAN verification completed for user",
      verified,
      data: raw,
    });
  } catch (err) {
    next(err);
  }
}

/** Company PAN */
export async function verifyCompanyPanHandler(req, res, next) {
  try {
    const userId = req.user._id;
    const tenant = getTenant(req);
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "Company PAN required");

    const v = await getOrCreate(userId);
    const panInput = String(pan).trim().toUpperCase();

    const existingCompanyPan =
      v.companyPan?.status === "verified"
        ? v.companyPan?.data?.pan || v.companyPan?.data
        : null;

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

    const { raw, verified } = await svc.verifyCompanyPan({
      tenant,
      pan: panInput,
      name,
    });

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

export async function verifyCompanyPanForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const { pan, name } = req.body;

    if (!pan) throw new ApiError(400, "Company PAN required");

    const v = await getOrCreate(userId);
    const panInput = String(pan).trim().toUpperCase();

    const existingCompanyPan =
      v.companyPan?.status === "verified"
        ? v.companyPan?.data?.pan || v.companyPan?.data
        : null;

    if (
      existingCompanyPan &&
      String(existingCompanyPan).toUpperCase() === panInput
    ) {
      return res.json({
        success: true,
        message: "Company PAN already verified for user",
        verified: true,
      });
    }

    const { raw, verified } = await svc.verifyCompanyPan({
      tenant,
      pan: panInput,
      name,
    });

    ensureField(v, "companyPan");
    v.companyPan.status = verified ? "verified" : "rejected";
    v.companyPan.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Company PAN verification completed for user",
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
    const tenant = getTenant(req);
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

    const { raw, verified } = await svc.verifyGstin({
      tenant,
      gstin,
    });

    ensureField(v, "gst");
    v.gst.status = verified ? "verified" : "rejected";
    v.gst.data = raw;

    await v.save();
    await updateAdminKyc(userId);

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

export async function verifyGstForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const { gstin } = req.body;

    if (!gstin) throw new ApiError(400, "GSTIN is required");

    const v = await getOrCreate(userId);

    if (v.gst?.status === "verified" && v.gst?.data?.GSTIN === gstin) {
      return res.json({
        success: true,
        message: "GST already verified for target user",
        verified: true,
        data: v.gst.status,
      });
    }

    const { raw, verified } = await svc.verifyGstin({
      tenant,
      gstin,
    });

    ensureField(v, "gst");
    v.gst.status = verified ? "verified" : "rejected";
    v.gst.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: raw?.message || "Invalid GST number",
      });
    }

    return res.json({
      success: true,
      message: "GST verification completed for user",
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
    const tenant = getTenant(req);
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

    const { raw, verified } = await svc.verifyCin({
      tenant,
      cin,
    });

    ensureField(v, "cin");
    v.cin.status = verified ? "verified" : "rejected";
    v.cin.data = raw;

    await v.save();
    await updateAdminKyc(userId);

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

export async function verifyCinForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const { cin } = req.body;

    if (!cin) throw new ApiError(400, "CIN is required");

    const v = await getOrCreate(userId);

    if (v.cin?.status === "verified" && v.cin?.data?.cin === cin) {
      return res.json({
        success: true,
        message: "CIN already verified for target user",
        verified: true,
        data: v.cin.status,
      });
    }

    const { raw, verified } = await svc.verifyCin({
      tenant,
      cin,
    });

    ensureField(v, "cin");
    v.cin.status = verified ? "verified" : "rejected";
    v.cin.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: raw?.message || "Invalid CIN number",
      });
    }

    return res.json({
      success: true,
      message: "CIN verification completed for user",
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
    const tenant = getTenant(req);
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

      ({ raw, verified } = await svc.verifyAadhaarOCR({ tenant, input }));
    } else {
      ({ raw, verified } = await svc.verifyAadhaarOCR({ tenant, input: fileUrl }));
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

export async function verifyAadhaarOCRForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
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

      ({ raw, verified } = await svc.verifyAadhaarOCR({ tenant, input }));
    } else {
      ({ raw, verified } = await svc.verifyAadhaarOCR({ tenant, input: fileUrl }));
    }

    ensureField(v, "aadhaar");
    v.aadhaar.status = verified ? "verified" : "rejected";
    v.aadhaar.data = raw;

    await v.save();
    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Aadhaar verification completed for user",
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
    const tenant = getTenant(req);
    const { bank_account, ifsc } = req.body;

    if (!bank_account || !ifsc) {
      throw new ApiError(400, "bank_account number and IFSC required");
    }

    const v = await getOrCreate(userId);

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

    const { raw, verified } = await svc.verifyBankSync({
      tenant,
      account: bank_account,
      ifsc,
    });

    ensureField(v, "bank");
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

export async function verifyBankSyncForUser(req, res, next) {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const { bank_account, ifsc } = req.body;

    if (!bank_account || !ifsc) {
      throw new ApiError(400, "bank_account number and IFSC required");
    }

    const v = await getOrCreate(userId);

    if (
      v.bank?.status === "verified" &&
      v.bank?.account === bank_account &&
      v.bank?.ifsc === ifsc
    ) {
      return res.json({
        success: true,
        message: "Bank already verified for target user",
        verified: true,
        data: v.bank.data,
      });
    }

    const { raw, verified } = await svc.verifyBankSync({
      tenant,
      account: bank_account,
      ifsc,
    });

    ensureField(v, "bank");
    v.bank.status = verified ? "verified" : "rejected";
    v.bank.account = bank_account;
    v.bank.ifsc = ifsc;
    v.bank.data = raw;
    v.bank.verifiedAt = new Date();

    await v.save();
    await updateAdminKyc(userId);

    return res.json({
      success: true,
      message: "Bank verification completed for user",
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
    const tenant = getTenant(req);
    const data = await svc.getPresignForKycImage(req.user._id, req.body, tenant);

    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getPresignForKycImageForUser = async (req, res) => {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);
    const data = await svc.getPresignForKycImage(userId, req.body, tenant);

    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const saveKycImage = async (req, res) => {
  try {
    const tenant = getTenant(req);

    const data = await svc.saveKycImage(
      req.user._id,
      {
        key: req.body.key,
        type: req.body.type,
      },
      tenant,
    );

    res.json({ success: true, message: "Image saved", data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const saveKycImageForUser = async (req, res) => {
  try {
    const userId = ensureTargetUserId(req);
    const tenant = getTenant(req);

    const data = await svc.saveKycImage(
      userId,
      {
        key: req.body.key,
        type: req.body.type,
      },
      tenant,
    );

    res.json({ success: true, message: "Image saved for user", data });
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
