import {
  getAdminProfileAggregate,
  updateAdminProfileOperational,
} from "../../services/adminProfile.service.js";
import { hasAdminPortalAccess } from "../../utils/authSession.js";

export const getAdminProfileHandler = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Admin profile access denied",
      });
    }

    const aggregate = await getAdminProfileAggregate(req.user._id);

    return res.json({
      success: true,
      role: aggregate.role,
      accountType: aggregate.accountType,
      isCompanyAdmin: aggregate.isCompanyAdmin,
      isEmployee: aggregate.isEmployee,
      customRoles: aggregate.customRoles,
      profile: aggregate.profile,
      user: aggregate.user,
      kyc: aggregate.kyc,
      company: aggregate.company,
      consultant: aggregate.consultant,
      verification: aggregate.verification,
      loginMethods: aggregate.loginMethods,
      security: aggregate.security,
      trustedDevices: aggregate.trustedDevices,
      securityEvents: aggregate.securityEvents,
      roleScope: aggregate.roleScope,
      recentActivity: aggregate.recentActivity,
      profileCompletion: aggregate.profileCompletion,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to load admin profile",
    });
  }
};

export const updateAdminProfileHandler = async (req, res) => {
  try {
    const aggregate = await updateAdminProfileOperational(
      req.user._id,
      req.body || {},
      req.user._id,
    );

    return res.json({
      success: true,
      message: "Admin profile updated",
      role: aggregate.role,
      accountType: aggregate.accountType,
      isCompanyAdmin: aggregate.isCompanyAdmin,
      isEmployee: aggregate.isEmployee,
      customRoles: aggregate.customRoles,
      profile: aggregate.profile,
      user: aggregate.user,
      kyc: aggregate.kyc,
      company: aggregate.company,
      consultant: aggregate.consultant,
      verification: aggregate.verification,
      loginMethods: aggregate.loginMethods,
      security: aggregate.security,
      trustedDevices: aggregate.trustedDevices,
      securityEvents: aggregate.securityEvents,
      pendingChanges: aggregate.pendingChanges || [],
      roleScope: aggregate.roleScope,
      recentActivity: aggregate.recentActivity,
      profileCompletion: aggregate.profileCompletion,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update admin profile",
    });
  }
};
