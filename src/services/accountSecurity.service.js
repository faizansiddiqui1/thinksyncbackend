import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";

import User from "../models/user_models/User.js";
import { decrypt, encrypt } from "../utils/crypto.util.js";
import { detectBrowser, detectOperatingSystem, buildDeviceLabel } from "../utils/deviceInfo.js";
import { buildOtpAuthUrl, generateTotpSecret, verifyTotpCode } from "../utils/totp.js";
import { isEmail } from "../utils/validatorUtils.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { generateOTP } from "../utils/otpUtils.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";
import { sendVerifyOtpEmail } from "./mail.service.js";
import { sendSMS } from "./sms.service.js";
import {
  logSecurityEvent,
  listSecurityEvents,
  SECURITY_EVENT_TYPES,
} from "./securityEvent.service.js";

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhoneRegex(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const local = normalizePhone(digits);
  if (!local) return null;
  return new RegExp(`${local.split("").map(escapeRegex).join("\\D*")}$`);
}

function buildPhoneCandidates(phone = "") {
  const local = normalizePhone(phone);
  if (!local) return [];
  return [...new Set([local, `91${local}`, `+91${local}`, phone])].filter(Boolean);
}

function resolveIdentifier(identifier) {
  if (!identifier) throw new Error("Identifier is required");

  const trimmed = String(identifier).trim();
  const mail = isEmail(trimmed);
  const email = mail ? trimmed.toLowerCase() : null;
  const phone = mail ? null : normalizePhone(trimmed);

  if (!mail && !phone) {
    throw new Error("Valid phone number is required");
  }

  return { isMail: mail, email, phone };
}

function buildPrimaryIdentifierQuery({ isMail, email, phone }) {
  if (isMail) return { email };

  const phoneRegex = buildPhoneRegex(phone);
  const phoneClauses = buildPhoneCandidates(phone).map((candidate) => ({
    phoneNumber: candidate,
  }));

  if (phoneRegex) phoneClauses.push({ phoneNumber: { $regex: phoneRegex } });
  return { $or: phoneClauses };
}

function buildRecoveryIdentifierQuery({ isMail, email, phone }) {
  if (isMail) {
    return {
      recoveryEmail: email,
      recoveryEmailVerified: true,
    };
  }

  const phoneRegex = buildPhoneRegex(phone);
  const phoneClauses = buildPhoneCandidates(phone).map((candidate) => ({
    recoveryPhone: candidate,
    recoveryPhoneVerified: true,
  }));
  if (phoneRegex) {
    phoneClauses.push({
      recoveryPhone: { $regex: phoneRegex },
      recoveryPhoneVerified: true,
    });
  }
  return { $or: phoneClauses };
}

function hashToken(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function maskIdentifier(identifier = "", isMail = true) {
  const value = String(identifier || "");
  if (!value) return "";

  if (isMail) {
    const [name = "", domain = ""] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }

  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function getSecurityConfig() {
  const values = await getPlatformConfigValues([
    "OTP_EXPIRY_MINUTES",
    "OTP_MAX_RETRIES",
    "ACCOUNT_LOCK_TIME_MS",
    "JWT_ACCESS_SECRET",
    "TWO_FACTOR_ISSUER",
    "TWO_FACTOR_CHALLENGE_MINUTES",
    "PASSWORD_RESET_ALLOW_MINUTES",
    "TRUSTED_DEVICE_DAYS",
  ]);

  return {
    otpExpiryMinutes: Math.max(5, Number(values.OTP_EXPIRY_MINUTES || 10)),
    otpMaxRetries: Math.max(3, Number(values.OTP_MAX_RETRIES || 3)),
    lockTimeMs: Math.max(
      5 * 60 * 1000,
      Number(values.ACCOUNT_LOCK_TIME_MS || 15 * 60 * 1000),
    ),
    accessSecret: values.JWT_ACCESS_SECRET,
    issuer: values.TWO_FACTOR_ISSUER || process.env.PLATFORM_NAME || "ThinkSync",
    challengeMinutes: Math.max(
      5,
      Number(values.TWO_FACTOR_CHALLENGE_MINUTES || 10),
    ),
    passwordResetAllowMinutes: Math.max(
      5,
      Number(values.PASSWORD_RESET_ALLOW_MINUTES || 15),
    ),
    trustedDeviceDays: Math.max(
      1,
      Number(values.TRUSTED_DEVICE_DAYS || 30),
    ),
  };
}

function normalizeSessionMeta(sessionMeta = {}) {
  return {
    ip: sessionMeta.ip || "",
    userAgent: sessionMeta.userAgent || "",
  };
}

async function sendOtpToChannel({ user, channel, target, otp, tenant = null, expiryMinutes }) {
  if (channel === "email") {
    await sendVerifyOtpEmail({
      tenant,
      to: target,
      userName: user?.username || user?.displayName || "there",
      otp,
      otpExpiryMinutes: expiryMinutes,
    });
    return;
  }

  await sendSMS(target, otp, { tenant });
}

function generateBackupCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function buildBackupCodes() {
  const plainCodes = Array.from({ length: 8 }, () => generateBackupCode());
  const hashedCodes = await Promise.all(
    plainCodes.map(async (code) => ({
      codeHash: await bcrypt.hash(code, 10),
      createdAt: new Date(),
      usedAt: null,
    })),
  );

  return { plainCodes, hashedCodes };
}

function decryptSecret(value = "") {
  if (!value) return "";
  return decrypt(value);
}

export async function getTrustedDeviceState(user, trustedDeviceToken = "") {
  if (!user?._id || !trustedDeviceToken) {
    return { trusted: false, device: null };
  }

  const tokenHash = hashToken(trustedDeviceToken);
  const devices = Array.isArray(user.trustedDevices) ? user.trustedDevices : [];
  const now = Date.now();
  const device = devices.find((item) => {
    if (!item?.tokenHash || item.tokenHash !== tokenHash) return false;
    if (!item.expiresAt) return true;
    return new Date(item.expiresAt).getTime() > now;
  });

  if (!device) {
    return { trusted: false, device: null };
  }

  return { trusted: true, device };
}

export async function rememberTrustedDevice(user, sessionMeta = {}, label = "") {
  const config = await getSecurityConfig();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + config.trustedDeviceDays * 24 * 60 * 60 * 1000,
  );
  const normalizedSession = normalizeSessionMeta(sessionMeta);
  const userAgent = normalizedSession.userAgent || "";

  user.trustedDevices = Array.isArray(user.trustedDevices)
    ? user.trustedDevices.filter(
        (device) => !device?.expiresAt || new Date(device.expiresAt).getTime() > Date.now(),
      )
    : [];

  user.trustedDevices.push({
    tokenHash: hashToken(rawToken),
    label: String(label || buildDeviceLabel(userAgent)).trim(),
    browser: detectBrowser(userAgent),
    os: detectOperatingSystem(userAgent),
    ip: normalizedSession.ip,
    userAgent,
    trustedAt: new Date(),
    expiresAt,
    lastUsedAt: new Date(),
  });

  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.TRUSTED_DEVICE_ADDED,
    ip: normalizedSession.ip,
    userAgent,
    metadata: {
      label: String(label || buildDeviceLabel(userAgent)).trim(),
      expiresAt,
    },
  });

  return {
    rawToken,
    expiresAt,
  };
}

export async function touchTrustedDevice(user, trustedDeviceToken = "") {
  if (!user?._id || !trustedDeviceToken || !Array.isArray(user.trustedDevices)) return;

  const tokenHash = hashToken(trustedDeviceToken);
  const device = user.trustedDevices.find((item) => item?.tokenHash === tokenHash);
  if (!device) return;

  device.lastUsedAt = new Date();
  await user.save();
}

export async function createTwoFactorLoginChallenge(
  user,
  sessionMeta = {},
  extraPayload = {},
) {
  const config = await getSecurityConfig();
  const payload = {
    userId: String(user._id),
    purpose: "two_factor_login",
    sessionMeta: normalizeSessionMeta(sessionMeta),
    ...extraPayload,
  };

  return jwt.sign(payload, config.accessSecret, {
    expiresIn: `${config.challengeMinutes}m`,
  });
}

export async function readTwoFactorLoginChallenge(challengeToken) {
  const config = await getSecurityConfig();
  return jwt.verify(String(challengeToken || ""), config.accessSecret);
}

export async function verifyTwoFactorCredential(user, { code = "", backupCode = "" } = {}) {
  if (!user?.securityPreferences?.twoFactorEnabled) {
    return { success: true, method: "none" };
  }

  const secretEncrypted = user?.twoFactor?.secretEncrypted || "";
  const secret = decryptSecret(secretEncrypted);

  if (code && secret && verifyTotpCode(secret, code)) {
    user.twoFactor.lastVerifiedAt = new Date();
    await user.save();
    return { success: true, method: "totp" };
  }

  if (backupCode && Array.isArray(user?.twoFactor?.backupCodes)) {
    for (const candidate of user.twoFactor.backupCodes) {
      if (candidate?.usedAt) continue;
      const matches = await bcrypt.compare(String(backupCode).trim(), candidate.codeHash);
      if (matches) {
        candidate.usedAt = new Date();
        user.twoFactor.lastVerifiedAt = new Date();
        await user.save();
        return { success: true, method: "backup_code" };
      }
    }
  }

  return { success: false, method: null };
}

export async function startTwoFactorEnrollment(userId) {
  const [config, user] = await Promise.all([
    getSecurityConfig(),
    User.findById(userId).select(
      "+twoFactor _id email phoneNumber username displayName securityPreferences",
    ),
  ]);

  if (!user) throw new Error("User not found");

  const secret = generateTotpSecret();
  const accountName = user.email || user.phoneNumber || user.username || String(user._id);
  const otpAuthUrl = buildOtpAuthUrl({
    secret,
    accountName,
    issuer: config.issuer,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, {
    margin: 1,
    width: 256,
  });

  user.twoFactor = {
    ...(user.twoFactor?.toObject?.() || user.twoFactor || {}),
    pendingSecretEncrypted: encrypt(secret),
    pendingSecretCreatedAt: new Date(),
  };
  await user.save();

  return {
    secret,
    qrCodeDataUrl,
    otpAuthUrl,
    issuer: config.issuer,
    accountName,
  };
}

export async function enableTwoFactorEnrollment(userId, { code }) {
  const user = await User.findById(userId).select(
    "+twoFactor _id securityPreferences username email phoneNumber",
  );

  if (!user) throw new Error("User not found");

  const pendingSecret = decryptSecret(user?.twoFactor?.pendingSecretEncrypted || "");
  if (!pendingSecret) {
    throw new Error("Two-factor enrollment has not been started");
  }

  if (!verifyTotpCode(pendingSecret, code)) {
    throw new Error("Authenticator code is invalid");
  }

  const { plainCodes, hashedCodes } = await buildBackupCodes();

  user.twoFactor.secretEncrypted = encrypt(pendingSecret);
  user.twoFactor.pendingSecretEncrypted = "";
  user.twoFactor.pendingSecretCreatedAt = null;
  user.twoFactor.enabledAt = new Date();
  user.twoFactor.lastVerifiedAt = new Date();
  user.twoFactor.backupCodes = hashedCodes;
  user.securityPreferences = {
    ...(user.securityPreferences || {}),
    twoFactorEnabled: true,
    twoFactorMethod: "totp",
    lastSecurityReviewAt: new Date(),
  };

  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.TWO_FACTOR_ENABLED,
    metadata: {
      method: "totp",
    },
  });

  return {
    enabled: true,
    method: "totp",
    enabledAt: user.twoFactor.enabledAt,
    backupCodes: plainCodes,
  };
}

async function assertPasswordReauth(user, currentPassword) {
  if (!user?.password) return;
  if (!currentPassword) {
    throw new Error("Current password is required");
  }

  const valid = await user.comparePassword(currentPassword);
  if (!valid) {
    throw new Error("Current password is incorrect");
  }
}

export async function disableTwoFactor(userId, { currentPassword, code, backupCode }) {
  const user = await User.findById(userId).select("+password +twoFactor");
  if (!user) throw new Error("User not found");

  if (!user?.securityPreferences?.twoFactorEnabled) {
    throw new Error("Two-factor authentication is not enabled");
  }

  await assertPasswordReauth(user, currentPassword);

  const verification = await verifyTwoFactorCredential(user, { code, backupCode });
  if (!verification.success) {
    throw new Error("Two-factor verification failed");
  }

  user.twoFactor.secretEncrypted = "";
  user.twoFactor.pendingSecretEncrypted = "";
  user.twoFactor.pendingSecretCreatedAt = null;
  user.twoFactor.enabledAt = null;
  user.twoFactor.lastVerifiedAt = null;
  user.twoFactor.backupCodes = [];
  user.securityPreferences = {
    ...(user.securityPreferences || {}),
    twoFactorEnabled: false,
    twoFactorMethod: "none",
    lastSecurityReviewAt: new Date(),
  };

  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.TWO_FACTOR_DISABLED,
  });

  return {
    enabled: false,
    method: "none",
  };
}

export async function regenerateTwoFactorBackupCodes(
  userId,
  { currentPassword, code, backupCode },
) {
  const user = await User.findById(userId).select("+password +twoFactor");
  if (!user) throw new Error("User not found");

  if (!user?.securityPreferences?.twoFactorEnabled) {
    throw new Error("Two-factor authentication is not enabled");
  }

  await assertPasswordReauth(user, currentPassword);

  const verification = await verifyTwoFactorCredential(user, { code, backupCode });
  if (!verification.success) {
    throw new Error("Two-factor verification failed");
  }

  const { plainCodes, hashedCodes } = await buildBackupCodes();
  user.twoFactor.backupCodes = hashedCodes;
  user.securityPreferences.lastSecurityReviewAt = new Date();
  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.BACKUP_CODES_REGENERATED,
  });

  return {
    backupCodes: plainCodes,
  };
}

export async function requestPasswordReset(identifier, tenant = null) {
  const config = await getSecurityConfig();
  const resolved = resolveIdentifier(identifier);

  const user = await User.findOne({
    $or: [
      buildPrimaryIdentifierQuery(resolved),
      buildRecoveryIdentifierQuery(resolved),
    ],
  }).select(
    "passwordReset.channel passwordReset.target passwordReset.expiresAt passwordReset.attempts passwordReset.verifiedAt passwordReset.allowUntil +passwordReset.otpHash",
  );

  if (!user) {
    return {
      success: true,
      message: "If that account exists, a verification code has been sent.",
    };
  }

  const channel = resolved.isMail ? "email" : "phone";
  const target = resolved.isMail ? resolved.email : resolved.phone;
  const otp = generateOTP();

  user.passwordReset = {
    channel,
    target,
    otpHash: await bcrypt.hash(otp, 12),
    expiresAt: new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000),
    attempts: 0,
    verifiedAt: null,
    allowUntil: null,
  };
  await user.save();

  await sendOtpToChannel({
    user,
    channel,
    target,
    otp,
    tenant,
    expiryMinutes: config.otpExpiryMinutes,
  });

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
    metadata: {
      channel,
      target: maskIdentifier(target, channel === "email"),
    },
  });

  return {
    success: true,
    message: "If that account exists, a verification code has been sent.",
  };
}

export async function verifyPasswordResetOtp(identifier, otp) {
  const config = await getSecurityConfig();
  const resolved = resolveIdentifier(identifier);

  const user = await User.findOne({
    $or: [
      buildPrimaryIdentifierQuery(resolved),
      buildRecoveryIdentifierQuery(resolved),
    ],
  }).select(
    "passwordReset.channel passwordReset.target passwordReset.expiresAt passwordReset.attempts passwordReset.verifiedAt passwordReset.allowUntil +passwordReset.otpHash",
  );

  if (!user?.passwordReset?.otpHash) {
    throw new Error("Password reset challenge not found");
  }

  if (
    !user.passwordReset.expiresAt ||
    new Date(user.passwordReset.expiresAt).getTime() < Date.now()
  ) {
    throw new Error("Password reset OTP expired");
  }

  const valid = await bcrypt.compare(String(otp || ""), user.passwordReset.otpHash);
  if (!valid) {
    user.passwordReset.attempts = Number(user.passwordReset.attempts || 0) + 1;
    if (user.passwordReset.attempts >= config.otpMaxRetries) {
      user.lockUntil = Date.now() + config.lockTimeMs;
    }
    await user.save();

    await logSecurityEvent({
      userId: user._id,
      actorId: user._id,
      eventType: SECURITY_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      status: "failure",
      metadata: { stage: "verify_otp" },
    });

    throw new Error("Invalid password reset OTP");
  }

  user.passwordReset.verifiedAt = new Date();
  user.passwordReset.allowUntil = new Date(
    Date.now() + config.passwordResetAllowMinutes * 60 * 1000,
  );
  user.passwordReset.attempts = 0;
  await user.save();

  const resetToken = jwt.sign(
    {
      userId: String(user._id),
      purpose: "password_reset",
      target: user.passwordReset.target,
    },
    config.accessSecret,
    {
      expiresIn: `${config.passwordResetAllowMinutes}m`,
    },
  );

  return {
    resetToken,
    allowUntil: user.passwordReset.allowUntil,
  };
}

export async function resetPasswordWithToken(resetToken, newPassword) {
  const config = await getSecurityConfig();

  if (!newPassword || String(newPassword).length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  let payload;
  try {
    payload = jwt.verify(String(resetToken || ""), config.accessSecret);
  } catch {
    throw new Error("Password reset token is invalid or expired");
  }

  if (payload?.purpose !== "password_reset" || !payload?.userId) {
    throw new Error("Password reset token is invalid");
  }

  const user = await User.findById(payload.userId).select(
    "passwordReset.channel passwordReset.target passwordReset.expiresAt passwordReset.attempts passwordReset.verifiedAt passwordReset.allowUntil +refreshTokens",
  );
  if (!user) throw new Error("User not found");

  if (
    !user.passwordReset?.verifiedAt ||
    !user.passwordReset?.allowUntil ||
    new Date(user.passwordReset.allowUntil).getTime() < Date.now()
  ) {
    throw new Error("Password reset session has expired");
  }

  user.password = newPassword;
  user.passwordReset = {
    channel: null,
    target: "",
    otpHash: "",
    expiresAt: null,
    attempts: 0,
    verifiedAt: null,
    allowUntil: null,
  };
  user.refreshTokens = [];
  user.securityPreferences = {
    ...(user.securityPreferences || {}),
    lastSecurityReviewAt: new Date(),
  };
  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
  });

  return {
    success: true,
  };
}

export async function listTrustedDevices(userId) {
  const user = await User.findById(userId).select("+trustedDevices");
  if (!user) throw new Error("User not found");

  return (user.trustedDevices || [])
    .filter(
      (device) => !device?.expiresAt || new Date(device.expiresAt).getTime() > Date.now(),
    )
    .sort(
      (left, right) =>
        new Date(right?.lastUsedAt || right?.trustedAt || 0).getTime() -
        new Date(left?.lastUsedAt || left?.trustedAt || 0).getTime(),
    )
    .map((device) => ({
      deviceId: device._id,
      label: device.label || buildDeviceLabel(device.userAgent || ""),
      browser: device.browser || detectBrowser(device.userAgent || ""),
      os: device.os || detectOperatingSystem(device.userAgent || ""),
      lastUsedAt: device.lastUsedAt || null,
      trustedAt: device.trustedAt || null,
      expiresAt: device.expiresAt || null,
    }));
}

export async function revokeTrustedDevice(userId, deviceId) {
  const user = await User.findById(userId).select("+trustedDevices");
  if (!user) throw new Error("User not found");

  const before = user.trustedDevices.length;
  user.trustedDevices = user.trustedDevices.filter(
    (device) => String(device?._id) !== String(deviceId),
  );

  if (user.trustedDevices.length === before) {
    throw new Error("Trusted device not found");
  }

  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.TRUSTED_DEVICE_REMOVED,
    metadata: { deviceId },
  });

  return { success: true };
}

export async function listUserSecurityActivity(userId, { limit = 20 } = {}) {
  return listSecurityEvents(userId, { limit });
}

export function buildSecuritySummary(user = {}) {
  const backupCodes = Array.isArray(user?.twoFactor?.backupCodes)
    ? user.twoFactor.backupCodes
    : [];

  return {
    twoFactorEnabled: Boolean(user?.securityPreferences?.twoFactorEnabled),
    twoFactorMethod: user?.securityPreferences?.twoFactorMethod || "none",
    twoFactorEnabledAt: user?.twoFactor?.enabledAt || null,
    backupCodesRemaining: backupCodes.filter((item) => !item?.usedAt).length,
    hasPassword: Boolean(user?.password),
    lastSecurityReviewAt: user?.securityPreferences?.lastSecurityReviewAt || null,
  };
}
