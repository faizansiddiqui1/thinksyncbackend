import SecurityEvent from "../models/user_models/SecurityEvent.js";

export const SECURITY_EVENT_TYPES = {
  PASSWORD_CHANGED: "password_changed",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  EMAIL_CHANGED: "email_changed",
  PHONE_CHANGED: "phone_changed",
  RECOVERY_EMAIL_ADDED: "recovery_email_added",
  RECOVERY_PHONE_ADDED: "recovery_phone_added",
  RECOVERY_EMAIL_CHANGED: "recovery_email_changed",
  RECOVERY_PHONE_CHANGED: "recovery_phone_changed",
  RECOVERY_CONTACT_VERIFIED: "recovery_contact_verified",
  RECOVERY_CONTACT_REMOVED: "recovery_contact_removed",
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILED: "login_failed",
  NEW_DEVICE_LOGIN: "new_device_login",
  SESSION_REVOKED: "session_revoked",
  LOGOUT_ALL: "logout_all",
  TWO_FACTOR_ENABLED: "two_factor_enabled",
  TWO_FACTOR_DISABLED: "two_factor_disabled",
  BACKUP_CODES_REGENERATED: "backup_codes_regenerated",
  TRUSTED_DEVICE_ADDED: "trusted_device_added",
  TRUSTED_DEVICE_REMOVED: "trusted_device_removed",
  CONTACT_VERIFICATION_REQUESTED: "contact_verification_requested",
};

export async function logSecurityEvent({
  userId,
  actorId = null,
  eventType,
  status = "success",
  ip = "",
  userAgent = "",
  metadata = {},
}) {
  if (!userId || !eventType) return null;

  try {
    return await SecurityEvent.create({
      user: userId,
      actor: actorId || userId,
      eventType,
      status,
      ip: ip || "",
      userAgent: userAgent || "",
      metadata: metadata || {},
      occurredAt: new Date(),
    });
  } catch (error) {
    console.error("security event logging failed:", error?.message || error);
    return null;
  }
}

export async function listSecurityEvents(userId, { limit = 20 } = {}) {
  if (!userId) return [];

  return SecurityEvent.find({ user: userId })
    .sort({ occurredAt: -1 })
    .limit(Math.max(1, Math.min(100, Number(limit || 20))))
    .lean();
}
