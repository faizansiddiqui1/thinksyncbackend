// utils/cookieUtils.js
export const getRefreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = isProd ? '.thinksyncspace.com' : undefined; // include dot to allow subdomains

  return {
    httpOnly: true,
    secure: isProd,                 // must be true in production (HTTPS)
    sameSite: isProd ? 'none' : 'lax', // none for cross-site production, lax is OK for dev
    domain: cookieDomain,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',                       // broad enough for refresh, logout, etc.
  };
};

export const TRUSTED_DEVICE_COOKIE = "trustedDevice";

export const getTrustedDeviceCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = isProd ? ".thinksyncspace.com" : undefined;

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: cookieDomain,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
};

export const BOOKING_DRAFT_GUEST_COOKIE = "thinksync_guest_booking";

export const getGuestDraftCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  const cookieDomain = isProd ? ".thinksyncspace.com" : undefined;

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    domain: cookieDomain,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
};
