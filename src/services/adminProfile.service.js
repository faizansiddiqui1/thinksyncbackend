import AdminProfile from "../models/admin_models/AdminProfile.js";
import Company from "../models/super_admin_models/Company.model.js";
import Consultant from "../models/super_admin_models/Consultant.js";
import User from "../models/user_models/User.js";
import { sendProfileOtp } from "./profile.service.js";
import {
  buildSecuritySummary,
  listTrustedDevices,
  listUserSecurityActivity,
} from "./accountSecurity.service.js";
import {
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
} from "./securityEvent.service.js";

function cleanText(value = "", maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanEmail(value = "") {
  return String(value || "").trim().toLowerCase().slice(0, 160);
}

function cleanPhone(value = "") {
  return String(value || "").trim().slice(0, 30);
}

function deriveAdminType({ user, company, consultant }) {
  if (user?.role === "super_admin") return "super_admin";
  if (user?.role === "consultant" || consultant) return "consultant";
  if (company?.owner && String(company.owner) === String(user?._id)) return "company_admin";
  return "admin";
}

function deriveAccountType({ user, company }) {
  if (user?.role === "super_admin") return "super_admin";
  if (user?.role === "consultant") return "consultant";
  if (company?.owner && String(company.owner) === String(user?._id)) return "company_admin";
  if (
    Array.isArray(company?.employees) &&
    company.employees.some((employee) => String(employee?.user?._id || employee?.user) === String(user?._id))
  ) {
    return "employee";
  }
  if (user?.role === "admin") return "admin";
  return "user";
}

function summarizeCompany(company = null) {
  if (!company) return null;

  return {
    _id: company._id,
    legalName: company.legalName || "",
    displayName: company.displayName || "",
    email: company.email || "",
    phoneNumber: company.phoneNumber || "",
    whatsappNumber: company.whatsappNumber || "",
    gstNumber: company.gstNumber || "",
    cinNumber: company.cinNumber || "",
    panNumber: company.panNumber || "",
    address: company.address || "",
    city: company.city || "",
    state: company.state || "",
    country: company.country || "",
    status: company.status || "active",
    assignedSpaceId: company.assignedSpaceId || null,
    spaces: Array.isArray(company.spaces) ? company.spaces : [],
    employeesCount: Array.isArray(company.employees) ? company.employees.length : 0,
  };
}

function summarizeConsultant(consultant = null) {
  if (!consultant) return null;

  return {
    _id: consultant._id,
    name: consultant.name || "",
    designation: consultant.designation || "",
    email: consultant.email || "",
    phone: consultant.phone || "",
    profileImage: consultant.profileImage || {},
    publicProfile: consultant.publicProfile || {},
    notes: consultant.notes || "",
    assignedCities: Array.isArray(consultant.assignedCities) ? consultant.assignedCities : [],
    assignedProductTypes: Array.isArray(consultant.assignedProductTypes)
      ? consultant.assignedProductTypes
      : [],
    assignedSpaceTypes: Array.isArray(consultant.assignedSpaceTypes)
      ? consultant.assignedSpaceTypes
      : [],
    assignedListingModes: Array.isArray(consultant.assignedListingModes)
      ? consultant.assignedListingModes
      : [],
    leadRouting: consultant.leadRouting || {},
    visibilityRules: consultant.visibilityRules || {},
    requestApprovalStatus: consultant.requestApprovalStatus || "approved",
    isActive: consultant.isActive !== false,
  };
}

function buildRoleScope({ user, company, consultant }) {
  const linkedCompanyIds = [];
  const linkedWorkspaceIds = [];

  if (user?.companyId) {
    linkedCompanyIds.push(user.companyId?._id || user.companyId);
  }

  if (company?.assignedSpaceId?._id || company?.assignedSpaceId) {
    linkedWorkspaceIds.push(company.assignedSpaceId?._id || company.assignedSpaceId);
  }

  if (Array.isArray(company?.spaces)) {
    company.spaces.forEach((space) => {
      const id = space?._id || space;
      if (id) linkedWorkspaceIds.push(id);
    });
  }

  const unique = (values = []) =>
    [...new Set(values.map((value) => String(value || "")).filter(Boolean))];

  return {
    linkedCompanyIds: unique(linkedCompanyIds),
    linkedWorkspaceIds: unique(linkedWorkspaceIds),
    consultantScope: consultant
      ? {
          assignedCityIds: unique(
            (consultant.assignedCities || []).map((city) => city?._id || city),
          ),
          productTypes: consultant.assignedProductTypes || [],
          spaceTypes: consultant.assignedSpaceTypes || [],
          listingModes: consultant.assignedListingModes || [],
        }
      : {
          assignedCityIds: [],
          productTypes: [],
          spaceTypes: [],
          listingModes: [],
        },
  };
}

function buildVerification(user = {}, adminProfile = {}) {
  return {
    email: {
      value: user.email || "",
      verified: Boolean(user.emailVerified),
      pending: user.pendingEmail || "",
    },
    phone: {
      value: user.phoneNumber || "",
      verified: Boolean(user.phoneVerified),
      pending: user.pendingPhone || "",
    },
    recoveryEmail: {
      value: user.recoveryEmail || adminProfile?.recovery?.email?.value || "",
      verified: Boolean(user.recoveryEmailVerified || adminProfile?.recovery?.email?.verified),
      pending: user.pendingRecoveryEmail || "",
    },
    recoveryPhone: {
      value: user.recoveryPhone || adminProfile?.recovery?.phone?.value || "",
      verified: Boolean(user.recoveryPhoneVerified || adminProfile?.recovery?.phone?.verified),
      pending: user.pendingRecoveryPhone || "",
    },
  };
}

function buildLoginMethods(user = {}) {
  const prefs = user.securityPreferences || {};
  return {
    emailEnabled: Boolean(user.email) && prefs.emailLoginEnabled !== false,
    phoneEnabled: Boolean(user.phoneNumber) && prefs.phoneLoginEnabled !== false,
    twoFactorEnabled: Boolean(prefs.twoFactorEnabled),
    twoFactorMethod: prefs.twoFactorMethod || "none",
  };
}

function buildRecentActivity({ user, adminProfile }) {
  return [
    {
      label: "Last login",
      at: user?.lastLogin || null,
    },
    {
      label: "Admin profile updated",
      at: adminProfile?.updatedAt || null,
    },
    {
      label: "Sensitive settings updated",
      at: adminProfile?.audit?.lastSensitiveProfileUpdateAt || null,
    },
  ].filter((item) => item.at);
}

function calculateProfileCompletion({ user, adminProfile, company, consultant }) {
  const fields = [
    user?.username,
    user?.displayName,
    user?.profileImage?.url,
    user?.email || user?.phoneNumber,
    adminProfile?.designation,
    adminProfile?.department,
    adminProfile?.preferences?.timezone,
    adminProfile?.preferences?.locale,
  ];

  if (company) {
    fields.push(company.legalName, company.email, company.phoneNumber);
  }

  if (consultant) {
    fields.push(consultant.name, consultant.designation, consultant.publicProfile?.bio);
  }

  const populated = fields.filter(Boolean).length;
  const total = Math.max(fields.length, 1);

  return Math.round((populated / total) * 100);
}

function isSameJson(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

export async function ensureAdminProfileForUser(user = null) {
  if (!user?._id) return null;

  const upserted = await AdminProfile.findOneAndUpdate(
    { owner: user._id },
    {
      $setOnInsert: {
        owner: user._id,
        adminType: user.role === "super_admin" ? "super_admin" : user.role === "consultant" ? "consultant" : "admin",
        kyc: { status: "not_submitted" },
      },
    },
    {
      new: true,
      upsert: true,
    },
  );

  return upserted;
}

async function findLinkedConsultant(user) {
  if (!user?._id) return null;

  const consultant = await Consultant.findOne({
    $or: [
      { linkedUser: user._id },
      ...(user.email ? [{ email: String(user.email).toLowerCase() }] : []),
      ...(user.phoneNumber ? [{ phone: user.phoneNumber }] : []),
    ],
  }).populate("assignedCities", "name slug");

  return consultant;
}

export async function getAdminProfileAggregate(userId) {
  const user = await User.findById(userId)
    .select(
      "_id email username displayName bio website profileImage phoneNumber pendingEmail pendingPhone pendingRecoveryEmail pendingRecoveryPhone recoveryEmail recoveryPhone recoveryEmailVerified recoveryPhoneVerified role phoneVerified emailVerified kyc isActive lastLogin customRoles companyId securityPreferences createdAt updatedAt +password +twoFactor +trustedDevices",
    )
    .populate({
      path: "customRoles",
      select: "name permissions",
    })
    .populate("companyId");

  if (!user) {
    throw new Error("User not found");
  }

  const [adminProfileSeed, company, consultant] = await Promise.all([
    ensureAdminProfileForUser(user),
    user.companyId
      ? Company.findById(user.companyId?._id || user.companyId).populate([
          { path: "assignedSpaceId", select: "name slug spaceType" },
          { path: "spaces", select: "name slug spaceType" },
          { path: "employees.user", select: "username email phoneNumber" },
        ])
      : null,
    findLinkedConsultant(user),
  ]);

  const adminProfile = adminProfileSeed;
  const adminType = deriveAdminType({ user, company, consultant });
  const accountType = deriveAccountType({ user, company });
  const roleScope = buildRoleScope({ user, company, consultant });
  const nextRoleScope = {
    ...(adminProfile.roleScope?.toObject?.() || adminProfile.roleScope || {}),
    ...roleScope,
  };

  let shouldPersistProfile = false;
  if (adminProfile.adminType !== adminType) {
    adminProfile.adminType = adminType;
    shouldPersistProfile = true;
  }

  if (!isSameJson(adminProfile.roleScope?.toObject?.() || adminProfile.roleScope || {}, nextRoleScope)) {
    adminProfile.roleScope = nextRoleScope;
    shouldPersistProfile = true;
  }

  if (shouldPersistProfile) {
    await adminProfile.save();
  }

  const [trustedDevices, securityEvents] = await Promise.all([
    listTrustedDevices(userId).catch(() => []),
    listUserSecurityActivity(userId, { limit: 10 }).catch(() => []),
  ]);

  return {
    role: user.role,
    accountType,
    isCompanyAdmin: accountType === "company_admin",
    isEmployee: accountType === "employee",
    customRoles: user.customRoles || [],
    user,
    profile: adminProfile,
    kyc: adminProfile.kyc || { status: "not_submitted" },
    company: summarizeCompany(company),
    consultant: summarizeConsultant(consultant),
    verification: buildVerification(user, adminProfile),
    loginMethods: buildLoginMethods(user),
    security: buildSecuritySummary(user),
    trustedDevices,
    securityEvents,
    roleScope: adminProfile.roleScope,
    recentActivity: buildRecentActivity({ user, adminProfile }),
    profileCompletion: calculateProfileCompletion({
      user,
      adminProfile,
      company,
      consultant,
    }),
  };
}

export async function updateAdminProfileOperational(userId, payload = {}, actorId = null) {
  const needsPasswordForSensitiveAction = Boolean(
    payload?.recovery?.email !== undefined || payload?.recovery?.phone !== undefined,
  );
  const user = await User.findById(userId).select(
    `_id recoveryEmail recoveryPhone recoveryEmailVerified recoveryPhoneVerified pendingRecoveryEmail pendingRecoveryPhone securityPreferences${needsPasswordForSensitiveAction ? " +password" : ""}`,
  );

  if (!user) throw new Error("User not found");

  if (needsPasswordForSensitiveAction && user.password) {
    const currentPassword = String(payload.currentPassword || "");
    if (!currentPassword) {
      throw new Error("Current password is required for recovery contact changes");
    }

    const passwordValid = await user.comparePassword(currentPassword);
    if (!passwordValid) {
      throw new Error("Current password is incorrect");
    }
  }

  const adminProfile = await ensureAdminProfileForUser(user);
  const pendingChanges = [];

  if (payload.designation !== undefined) {
    adminProfile.designation = cleanText(payload.designation, 120);
  }

  if (payload.department !== undefined) {
    adminProfile.department = cleanText(payload.department, 120);
  }

  if (payload.staffCode !== undefined) {
    adminProfile.staffCode = cleanText(payload.staffCode, 60);
  }

  if (payload.preferences) {
    adminProfile.preferences = {
      ...(adminProfile.preferences?.toObject?.() || adminProfile.preferences || {}),
      defaultDashboard: cleanText(payload.preferences.defaultDashboard, 80),
      timezone: cleanText(payload.preferences.timezone || "Asia/Calcutta", 80),
      locale: cleanText(payload.preferences.locale || "en-IN", 20),
    };
  }

  if (payload.notifications) {
    adminProfile.notifications = {
      ...(adminProfile.notifications?.toObject?.() || adminProfile.notifications || {}),
      securityAlerts: payload.notifications.securityAlerts !== false,
      approvalTasks: payload.notifications.approvalTasks !== false,
      bookingAlerts: payload.notifications.bookingAlerts !== false,
      billingAlerts: Boolean(payload.notifications.billingAlerts),
      operationsAlerts: payload.notifications.operationsAlerts !== false,
    };
  }

  if (payload.emergencyContact) {
    adminProfile.emergencyContact = {
      name: cleanText(payload.emergencyContact.name, 120),
      relation: cleanText(payload.emergencyContact.relation, 80),
      email: cleanEmail(payload.emergencyContact.email),
      phone: cleanPhone(payload.emergencyContact.phone),
    };
  }

  if (payload.recovery) {
    const recovery = payload.recovery || {};

    if (recovery.email !== undefined) {
      const nextEmail = cleanEmail(recovery.email);
      if (!nextEmail) {
        if (user.recoveryEmail || user.pendingRecoveryEmail) {
          user.recoveryEmail = "";
          user.recoveryEmailVerified = false;
          user.pendingRecoveryEmail = "";
          user.pendingRecoveryEmailRequestedAt = undefined;
          adminProfile.recovery.email = {
            value: "",
            verified: false,
            updatedAt: null,
          };
          await logSecurityEvent({
            userId,
            actorId: actorId || userId,
            eventType: SECURITY_EVENT_TYPES.RECOVERY_CONTACT_REMOVED,
            metadata: { channel: "email" },
          });
        }
      } else if (nextEmail !== user.recoveryEmail) {
        await sendProfileOtp(userId, nextEmail, { contactType: "recovery" });
        pendingChanges.push("recovery_email");
      }
    }

    if (recovery.phone !== undefined) {
      const nextPhone = cleanPhone(recovery.phone);
      if (!nextPhone) {
        if (user.recoveryPhone || user.pendingRecoveryPhone) {
          user.recoveryPhone = "";
          user.recoveryPhoneVerified = false;
          user.pendingRecoveryPhone = "";
          user.pendingRecoveryPhoneRequestedAt = undefined;
          adminProfile.recovery.phone = {
            value: "",
            verified: false,
            updatedAt: null,
          };
          await logSecurityEvent({
            userId,
            actorId: actorId || userId,
            eventType: SECURITY_EVENT_TYPES.RECOVERY_CONTACT_REMOVED,
            metadata: { channel: "phone" },
          });
        }
      } else if (nextPhone !== user.recoveryPhone) {
        await sendProfileOtp(userId, nextPhone, { contactType: "recovery" });
        pendingChanges.push("recovery_phone");
      }
    }
  }

  adminProfile.audit.lastSensitiveProfileUpdateAt = new Date();
  adminProfile.audit.lastSensitiveProfileUpdatedBy = actorId || userId;

  await Promise.all([user.save(), adminProfile.save()]);

  const aggregate = await getAdminProfileAggregate(userId);
  return {
    ...aggregate,
    pendingChanges,
  };
}
