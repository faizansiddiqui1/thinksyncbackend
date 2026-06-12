import jwt from "jsonwebtoken";
import crypto from "crypto";
import mongoose from "mongoose";

import User from "../../models/user_models/User.js";
import {
  completeTwoFactorLogin,
  finalizeAuthenticatedSession,
  loginWithPassword,
  registerWithPassword,
  sendLoginOTP,
  sendOtp,
  sendSignupOTP,
  verifyOTPAndCreateTokens,
} from "../../services/auth.service.js";
import {
  buildSecuritySummary,
  disableTwoFactor,
  enableTwoFactorEnrollment,
  listTrustedDevices,
  listUserSecurityActivity,
  regenerateTwoFactorBackupCodes,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeTrustedDevice,
  startTwoFactorEnrollment,
  verifyPasswordResetOtp,
} from "../../services/accountSecurity.service.js";
import {
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
} from "../../services/securityEvent.service.js";
import {
  getRefreshCookieOptions,
  getTrustedDeviceCookieOptions,
  TRUSTED_DEVICE_COOKIE,
} from "../../utils/cookieUtils.js";
import { getPlatformConfigValues } from "../../services/platformConfigResolver.service.js";
import { attachGuestBookingDraftsToUser } from "./bookingDraft.controller.js";

function getSessionMeta(req) {
  return {
    ip:
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  };
}

function applyTrustedDeviceCookie(res, trustedDevice = null) {
  if (!trustedDevice?.rawToken) return;
  res.cookie(
    TRUSTED_DEVICE_COOKIE,
    trustedDevice.rawToken,
    getTrustedDeviceCookieOptions(),
  );
}

function clearTrustedDeviceCookie(res) {
  res.clearCookie(TRUSTED_DEVICE_COOKIE, getTrustedDeviceCookieOptions());
}

function buildAuthSuccessPayload(result = {}, extra = {}) {
  return {
    accessToken: result.accessToken,
    user: result.user?.toJSON?.() || result.user,
    company: result.company || null,
    ...extra,
  };
}

export const sendOtpHandler = async (req, res) => {
  try {
    const { identifier, username, intent } = req.body;
    const tenant = req.context?.tenant || null;

    if (!identifier) {
      return res.status(400).json({ message: "Email or phone required" });
    }

    const result = await sendOtp({
      identifier,
      username,
      intent,
      tenant,
    });

    return res.status(200).json({
      message: "OTP sent",
      role: result.role,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const signup = async (req, res) => {
  try {
    const { username, identifier } = req.body;
    const tenant = req.context?.tenant || null;

    if (!username || !identifier) {
      return res
        .status(400)
        .json({ message: "Username and email or phone required" });
    }

    await sendSignupOTP({ username, identifier, tenant });
    return res.status(200).json({ message: "OTP sent for signup" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const passwordSignup = async (req, res) => {
  try {
    const { username, identifier, password, confirmPassword, intent } = req.body || {};
    const tenant = req.context?.tenant || null;

    const result = await registerWithPassword({
      username,
      identifier,
      password,
      confirmPassword,
      intent,
      tenant,
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier } = req.body;
    const tenant = req.context?.tenant || null;

    if (!identifier) {
      return res.status(400).json({ message: "Email or phone required" });
    }

    await sendLoginOTP(identifier, tenant);
    return res.status(200).json({ message: "OTP sent for login" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const passwordLogin = async (req, res) => {
  try {
    const { identifier, password, intent } = req.body || {};
    const trustedDeviceToken = req.cookies?.[TRUSTED_DEVICE_COOKIE] || "";
    const sessionMeta = getSessionMeta(req);

    const result = await loginWithPassword({
      identifier,
      password,
      sessionMeta,
      intent,
      trustedDeviceToken,
    });

    if (result?.requiresTwoFactor) {
      return res.status(200).json({
        requiresTwoFactor: true,
        challengeToken: result.challengeToken,
        methods: result.methods || ["totp", "backup_code"],
        user: result.user,
        company: result.company || null,
      });
    }

    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
    return res.status(200).json(buildAuthSuccessPayload(result));
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { identifier, otp, intent } = req.body;
    const trustedDeviceToken = req.cookies?.[TRUSTED_DEVICE_COOKIE] || "";

    if (!identifier || !otp) {
      return res.status(400).json({ message: "Identifier and OTP required" });
    }

    const result = await verifyOTPAndCreateTokens(
      identifier,
      otp,
      getSessionMeta(req),
      { intent, trustedDeviceToken },
    );

    if (result?.requiresTwoFactor) {
      return res.status(200).json({
        requiresTwoFactor: true,
        challengeToken: result.challengeToken,
        methods: result.methods || ["totp", "backup_code"],
        user: result.user,
        company: result.company || null,
      });
    }

    const draftMigration = await attachGuestBookingDraftsToUser(req, result.user?._id);

    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
    return res.status(200).json(
      buildAuthSuccessPayload(result, {
        bookingDraftsMigrated: Number(draftMigration?.updatedCount || 0),
      }),
    );
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export const verifyTwoFactorLoginHandler = async (req, res) => {
  try {
    const {
      challengeToken,
      code,
      backupCode,
      rememberDevice = false,
      deviceLabel = "",
    } = req.body || {};

    const result = await completeTwoFactorLogin(
      challengeToken,
      { code, backupCode, rememberDevice, deviceLabel },
      {
        trustedDeviceToken: req.cookies?.[TRUSTED_DEVICE_COOKIE] || "",
      },
    );

    res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());
    applyTrustedDeviceCookie(res, result.trustedDevice || null);

    return res.status(200).json(buildAuthSuccessPayload(result));
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
};

export const requestPasswordResetHandler = async (req, res) => {
  try {
    const tenant = req.context?.tenant || null;
    const { identifier } = req.body || {};
    if (!identifier) {
      return res.status(400).json({ message: "Identifier is required" });
    }

    const result = await requestPasswordReset(identifier, tenant);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const verifyPasswordResetHandler = async (req, res) => {
  try {
    const { identifier, otp } = req.body || {};
    if (!identifier || !otp) {
      return res.status(400).json({ message: "Identifier and OTP are required" });
    }

    const result = await verifyPasswordResetOtp(identifier, otp);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const resetPasswordHandler = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body || {};
    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Reset token, new password, and confirm password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password must match",
      });
    }

    await resetPasswordWithToken(resetToken, newPassword);
    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const startTwoFactorEnrollmentHandler = async (req, res) => {
  try {
    const payload = await startTwoFactorEnrollment(req.user._id);
    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const enableTwoFactorEnrollmentHandler = async (req, res) => {
  try {
    const { code } = req.body || {};
    const payload = await enableTwoFactorEnrollment(req.user._id, { code });
    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const disableTwoFactorHandler = async (req, res) => {
  try {
    const { currentPassword, code, backupCode } = req.body || {};
    const payload = await disableTwoFactor(req.user._id, {
      currentPassword,
      code,
      backupCode,
    });
    clearTrustedDeviceCookie(res);
    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const regenerateBackupCodesHandler = async (req, res) => {
  try {
    const { currentPassword, code, backupCode } = req.body || {};
    const payload = await regenerateTwoFactorBackupCodes(req.user._id, {
      currentPassword,
      code,
      backupCode,
    });
    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getTwoFactorStatusHandler = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password +twoFactor");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      security: buildSecuritySummary(user),
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getSecurityActivityHandler = async (req, res) => {
  try {
    const events = await listUserSecurityActivity(req.user._id, {
      limit: req.query?.limit || 20,
    });
    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const getTrustedDevicesHandler = async (req, res) => {
  try {
    const devices = await listTrustedDevices(req.user._id);
    return res.status(200).json({
      success: true,
      devices,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const revokeTrustedDeviceHandler = async (req, res) => {
  try {
    await revokeTrustedDevice(req.user._id, req.params.deviceId);
    return res.status(200).json({
      success: true,
      message: "Trusted device removed",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies?.refreshToken;
    if (!oldRefreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const authConfig = await getPlatformConfigValues([
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "JWT_ACCESS_EXPIRY",
      "JWT_REFRESH_EXPIRY",
    ]);
    const payload = jwt.verify(oldRefreshToken, authConfig.JWT_REFRESH_SECRET);

    const oldTokenHash = crypto
      .createHash("sha256")
      .update(oldRefreshToken)
      .digest("hex");

    const user = await User.findOne({
      _id: payload.userId,
      "refreshTokens.token": oldTokenHash,
    }).select("+refreshTokens");

    if (!user) {
      return res.status(401).json({ message: "Token reuse detected" });
    }

    user.refreshTokens = user.refreshTokens.filter(
      (tokenRecord) => tokenRecord.token !== oldTokenHash,
    );

    const newAccessToken = jwt.sign(
      { userId: user._id },
      authConfig.JWT_ACCESS_SECRET,
      { expiresIn: authConfig.JWT_ACCESS_EXPIRY || "60m" },
    );

    const newRefreshToken = jwt.sign(
      { userId: user._id },
      authConfig.JWT_REFRESH_SECRET,
      { expiresIn: authConfig.JWT_REFRESH_EXPIRY || "7d" },
    );

    const newTokenHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    const sessionMeta = getSessionMeta(req);
    user.refreshTokens.push({
      token: newTokenHash,
      ip: sessionMeta.ip,
      userAgent: sessionMeta.userAgent,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    });

    await user.save();

    res.cookie("refreshToken", newRefreshToken, getRefreshCookieOptions());
    return res.json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

export const getActiveSessions = async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshTokens");
  const currentRefreshToken = req.cookies?.refreshToken || "";
  const currentTokenHash = currentRefreshToken
    ? crypto.createHash("sha256").update(currentRefreshToken).digest("hex")
    : "";

  const sessions = (user?.refreshTokens || []).map((session) => ({
    sessionId: session._id,
    ip: session.ip,
    device: session.userAgent,
    lastUsedAt: session.lastUsedAt,
    createdAt: session.createdAt,
    isCurrentSession:
      Boolean(currentTokenHash) && session.token === currentTokenHash,
  }));

  return res.json({ sessions });
};

export const logoutSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const result = await User.updateOne(
      { _id: req.user._id, "refreshTokens._id": sessionId },
      { $pull: { refreshTokens: { _id: sessionId } } },
    );

    if (result.matchedCount === 0 || result.modifiedCount === 0) {
      return res.status(404).json({
        message: "Session not found or already logged out",
      });
    }

    await logSecurityEvent({
      userId: req.user._id,
      actorId: req.user._id,
      eventType: SECURITY_EVENT_TYPES.SESSION_REVOKED,
      metadata: { sessionId },
    });

    return res.json({
      success: true,
      message: "Session logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to logout session",
    });
  }
};

export const logoutAllDevices = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { refreshTokens: [] } },
    );

    res.clearCookie("refreshToken", getRefreshCookieOptions());
    clearTrustedDeviceCookie(res);

    await logSecurityEvent({
      userId: req.user._id,
      actorId: req.user._id,
      eventType: SECURITY_EVENT_TYPES.LOGOUT_ALL,
    });

    return res.json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to logout from all devices",
    });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      clearTrustedDeviceCookie(res);
      return res.sendStatus(204);
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await User.updateOne(
      { "refreshTokens.token": tokenHash },
      { $pull: { refreshTokens: { token: tokenHash } } },
    );

    res.clearCookie("refreshToken", getRefreshCookieOptions());
    clearTrustedDeviceCookie(res);

    return res.sendStatus(204);
  } catch (error) {
    return res.status(500).json({ message: "Logout failed" });
  }
};
