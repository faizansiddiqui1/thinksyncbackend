import AdminProfile from "../models/admin_models/AdminProfile.js";
import CompanyVerification from "../models/admin_models/CompanyVerification.js";
import User from "../models/user_models/User.js";
import {
  getGlobalKycConfig,
  normalizeGlobalKycConfig,
} from "./globalKycConfig.service.js";

function hasVerifiedStatus(value) {
  return value?.status === "verified";
}

function isPanVerified(value) {
  return Boolean(
    hasVerifiedStatus(value) ||
      value?.data?.valid === true ||
      String(value?.data?.pan_status || "").toUpperCase() === "VALID",
  );
}

export const KYC_REQUIREMENTS = Object.freeze([
  {
    key: "pan",
    configKey: "requirePan",
    isVerified: ({ companyVerification, user }) =>
      isPanVerified(companyVerification?.pan) || isPanVerified(user?.kyc?.pan),
  },
  {
    key: "aadhaar",
    configKey: "requireAadhaar",
    isVerified: ({ companyVerification, user }) =>
      hasVerifiedStatus(companyVerification?.aadhaar) ||
      hasVerifiedStatus(user?.kyc?.aadhaar) ||
      user?.kyc?.aadhaar?.ocr?.verified === true,
  },
  {
    key: "companyPan",
    configKey: "requireCompanyPan",
    isVerified: ({ companyVerification }) =>
      hasVerifiedStatus(companyVerification?.companyPan),
  },
  {
    key: "gstin",
    configKey: "requireGstin",
    isVerified: ({ companyVerification }) =>
      hasVerifiedStatus(companyVerification?.gst),
  },
  {
    key: "cin",
    configKey: "requireCin",
    isVerified: ({ companyVerification }) =>
      hasVerifiedStatus(companyVerification?.cin),
  },
  {
    key: "bank",
    configKey: "requireBankCheack",
    isVerified: ({ companyVerification }) =>
      hasVerifiedStatus(companyVerification?.bank),
  },
  {
    key: "faceMatch",
    configKey: "requireFaceMatch",
    isVerified: ({ user }) => user?.kyc?.faceMatch?.matched === true,
  },
]);

export function evaluateKycRequirements({
  config = {},
  companyVerification = null,
  user = null,
}) {
  const normalizedConfig = normalizeGlobalKycConfig(config);
  const checks = Object.fromEntries(
    KYC_REQUIREMENTS.map((requirement) => {
      const required = normalizedConfig[requirement.configKey] === true;
      return [
        requirement.key,
        {
          required,
          verified: required
            ? requirement.isVerified({ companyVerification, user })
            : true,
        },
      ];
    }),
  );

  const requiredChecks = KYC_REQUIREMENTS.filter(
    (requirement) => checks[requirement.key].required,
  ).map((requirement) => requirement.key);
  const pendingChecks = requiredChecks.filter(
    (key) => checks[key].verified !== true,
  );

  return {
    status: pendingChecks.length === 0 ? "approved" : "pending",
    config: normalizedConfig,
    checks,
    requiredChecks,
    pendingChecks,
  };
}

export async function syncAdminKycApproval(userId) {
  const [config, user, companyVerification, existingAdminProfile] =
    await Promise.all([
      getGlobalKycConfig(),
      User.findById(userId),
      CompanyVerification.findOne({ userId }),
      AdminProfile.findOne({ owner: userId }),
    ]);

  if (!user) {
    throw new Error("User not found");
  }

  const decision = evaluateKycRequirements({
    config,
    companyVerification,
    user,
  });
  const isAdminAccount = Boolean(
    existingAdminProfile ||
      user.role === "pending_admin" ||
      user.role === "admin",
  );

  if (!isAdminAccount || user.role === "super_admin") {
    return {
      ...decision,
      user,
      companyVerification,
      adminProfile: existingAdminProfile,
    };
  }

  const adminProfile =
    existingAdminProfile ||
    new AdminProfile({
      owner: user._id,
      kyc: { status: "not_submitted" },
    });

  adminProfile.kyc.status = decision.status;
  adminProfile.kyc.reviewedAt =
    decision.status === "approved" ? new Date() : null;

  user.kyc.status = decision.status;
  user.kyc.reviewedAt =
    decision.status === "approved" ? new Date() : null;
  user.role = decision.status === "approved" ? "admin" : "pending_admin";

  await Promise.all([adminProfile.save(), user.save()]);

  return {
    ...decision,
    user,
    companyVerification,
    adminProfile,
  };
}

export async function reconcileAdminKycApprovals() {
  const [profileOwners, adminUsers] = await Promise.all([
    AdminProfile.distinct("owner", { owner: { $ne: null } }),
    User.find({ role: { $in: ["pending_admin", "admin"] } })
      .select("_id")
      .lean(),
  ]);
  const userIds = [
    ...new Set(
      [...profileOwners, ...adminUsers.map((user) => user._id)]
        .filter(Boolean)
        .map(String),
    ),
  ];

  const results = await Promise.allSettled(
    userIds.map((userId) => syncAdminKycApproval(userId)),
  );

  return {
    evaluated: results.length,
    updated: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
