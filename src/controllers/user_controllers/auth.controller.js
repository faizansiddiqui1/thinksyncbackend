import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../../models/user_models/User.js";
import {
  sendOtp,
  sendLoginOTP,
  sendSignupOTP,
  verifyOTPAndCreateTokens,
} from "../../services/auth.service.js";
import { getRefreshCookieOptions } from "../../utils/cookieUtils.js";
import mongoose from "mongoose";
import { getPlatformConfigValues } from "../../services/platformConfigResolver.service.js";
import { attachGuestBookingDraftsToUser } from "./bookingDraft.controller.js";



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
    res.status(200).json({ message: "OTP sent for signup" });
  } catch (error) {
    res.status(400).json({ message: error.message });
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
    res.status(200).json({ message: "OTP sent for login" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { identifier, otp, intent } = req.body;

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    if (!identifier || !otp) {
      return res.status(400).json({ message: "Identifier and OTP required" });
    }

    const { accessToken, refreshToken, user, company } =
      await verifyOTPAndCreateTokens(
        identifier,
        otp,
        { ip, userAgent },
        { intent },
      );

    const draftMigration = await attachGuestBookingDraftsToUser(req, user?._id);

    const cookieOptions = getRefreshCookieOptions();
    res.cookie("refreshToken", refreshToken, cookieOptions);

    res.status(200).json({
      accessToken,
      user: user.toJSON(),
      company,
      bookingDraftsMigrated: Number(draftMigration?.updatedCount || 0),
    });
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies?.refreshToken;
    if (!oldRefreshToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1️⃣ Verify JWT
    const authConfig = await getPlatformConfigValues([
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "JWT_ACCESS_EXPIRY",
      "JWT_REFRESH_EXPIRY",
    ]);
    const payload = jwt.verify(oldRefreshToken, authConfig.JWT_REFRESH_SECRET);

    // 2️⃣ Hash incoming refresh token
    const oldTokenHash = crypto
      .createHash("sha256")
      .update(oldRefreshToken)
      .digest("hex");

    // 3️⃣ Find user having this refresh token
    const user = await User.findOne({
      _id: payload.userId,
      "refreshTokens.token": oldTokenHash,
    }).select("+refreshTokens");

    if (!user) {
      // 🚨 Token reuse / stolen token
      return res.status(401).json({ message: "Token reuse detected" });
    }

    // 4️⃣ Remove old refresh token
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.token !== oldTokenHash,
    );

    // 5️⃣ Generate NEW tokens
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

    // 6️⃣ Store NEW refresh token (hashed)
    const newTokenHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;

    const userAgent = req.headers["user-agent"];

    user.refreshTokens.push({
      token: newTokenHash,
      ip,
      userAgent,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    });

    await user.save();

    // 7️⃣ Set new cookie
    res.cookie("refreshToken", newRefreshToken, getRefreshCookieOptions());

    // 8️⃣ Respond
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res
      .status(401)
      .json({ message: "Invalid or expired refresh token" });
  }
};

export const getActiveSessions = async (req, res) => {
  const user = await User.findById(req.user._id).select("+refreshTokens");

  const sessions = user.refreshTokens.map((s) => ({
    sessionId: s._id, // 👈 REQUIRED
    ip: s.ip,
    device: s.userAgent,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
  }));

  res.json({ sessions });
};

export const logoutSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // 1️⃣ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    // 2️⃣ Remove specific session
    const result = await User.updateOne(
      { _id: req.user._id, "refreshTokens._id": sessionId },
      { $pull: { refreshTokens: { _id: sessionId } } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: "Session not found or already logged out",
      });
    }

    // 3️⃣ Nothing deleted → wrong session id
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        message: "Session not found or already logged out",
      });
    }

    return res.json({
      success: true,
      message: "Session logged out successfully",
    });
  } catch (err) {
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

    return res.json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to logout from all devices",
    });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    // No cookie → already logged out
    if (!refreshToken) {
      return res.sendStatus(204);
    }

    // Hash refresh token
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // Remove refresh token from DB
    await User.updateOne(
      { "refreshTokens.token": tokenHash },
      { $pull: { refreshTokens: { token: tokenHash } } },
    );

    // Clear cookie
    res.clearCookie("refreshToken", getRefreshCookieOptions());

    return res.sendStatus(204);
  } catch (err) {
    return res.status(500).json({ message: "Logout failed" });
  }
};
