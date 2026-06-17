export const AUTH_SESSION_SCOPES = Object.freeze({
  USER: "user",
  ADMIN: "admin",
});

const ADMIN_AUTH_INTENTS = new Set(["admin", "admin-login", "admin-signup"]);

export function normalizeAuthIntent(intent = "") {
  return String(intent || "").trim().toLowerCase();
}

export function isAdminAuthIntent(intent = "") {
  return ADMIN_AUTH_INTENTS.has(normalizeAuthIntent(intent));
}

export function resolveSessionScope({ intent } = {}) {
  return isAdminAuthIntent(intent)
    ? AUTH_SESSION_SCOPES.ADMIN
    : AUTH_SESSION_SCOPES.USER;
}

export function hasAdminPortalAccess(user = null) {
  if (!user) return false;

  if (
    ["pending_admin", "admin", "super_admin", "consultant"].includes(user.role)
  ) {
    return true;
  }

  if (Array.isArray(user.customRoles) && user.customRoles.length > 0) {
    return true;
  }

  return Boolean(user.companyId);
}
