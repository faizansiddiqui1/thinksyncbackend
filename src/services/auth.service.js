// services/authService.js
import User from "../models/user_models/User.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import { generateOTP } from "../utils/otpUtils.js";
import { sendEmail } from "./mail.service.js";
import { sendSMS } from "./sms.service.js";
import { isEmail } from "../utils/validatorUtils.js";
import { isNewDevice } from "../utils/helper.js";
import { sendNewDeviceLoginAlert } from "./alert.service.js";
import { normalizePhone } from "../utils/phoneUtils.js";

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);

const resolveIdentifier = (identifier) => {
  if (!identifier) {
    throw new Error("Identifier is required");
  }

  const trimmed = String(identifier).trim();
  const isMail = isEmail(trimmed);
  const email = isMail ? trimmed.toLowerCase() : null;
  const phone = isMail ? null : normalizePhone(trimmed);

  if (!isMail && !phone) {
    throw new Error("Valid phone number is required");
  }

  return { isMail, email, phone };
};

const issueOtp = async (user, target, isMail) => {
  if (user.isActive === false) {
    throw new Error("Account disabled");
  }

  if (user.isLocked) {
    throw new Error("Account locked. Try again later.");
  }

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 12);

  user.otpHash = otpHash;
  user.otpExpires = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
  user.otpAttempts = 0;
  await user.save();

  if (isMail) {
    await sendEmail({
      to: target,
      subject: "Your OTP Code",
      html: `
        <p>
          Your OTP is <strong>${otp}</strong>.
          It expires in ${OTP_EXPIRY_MINUTES} minutes.
        </p>
      `,
    });
  } else {
    await sendSMS(target, otp);
  }

  return true;
};

const normalizeUsername = (username) => {
  if (username === undefined || username === null) return null;
  const normalized = String(username).trim().toLowerCase();
  return normalized || null;
};

const ensureUsernameAvailable = async (normalizedUsername) => {
  if (!normalizedUsername) return;
  const existingByUsername = await User.findOne({
    username: normalizedUsername,
  });
  if (existingByUsername) {
    throw new Error("Username already taken");
  }
};

const ensureAdminProfile = async (ownerId) => {
  const existing = await AdminProfile.findOne({ owner: ownerId }).lean();
  if (existing) return existing;
  return AdminProfile.create({
    owner: ownerId,
    kyc: { status: "pending", submittedAt: new Date() },
  });
};

export const sendOtp = async ({ username, identifier, intent = "login" }) => {
  const { isMail, email, phone } = resolveIdentifier(identifier);
  const normalizedUsername = normalizeUsername(username);
  const normalizedIntent = String(intent || "login")
    .trim()
    .toLowerCase();

  const user = await User.findOne(isMail ? { email } : { phoneNumber: phone });

  if (normalizedIntent === "login") {
    if (!user) {
      throw new Error("Account not found. Please signup.");
    }
    return issueOtp(user, isMail ? email : phone, isMail);
  }

  if (normalizedIntent === "signup") {
    if (!normalizedUsername) {
      throw new Error("Username is required");
    }

    if (user) {
      throw new Error("Account already exists. Please login.");
    }

    await ensureUsernameAvailable(normalizedUsername);

    const newUser = new User(
      isMail
        ? { username: normalizedUsername, email }
        : { username: normalizedUsername, phoneNumber: phone },
    );

    return issueOtp(newUser, isMail ? email : phone, isMail);
  }

  if (normalizedIntent === "admin") {
    if (!user) {
      if (normalizedUsername) {
        await ensureUsernameAvailable(normalizedUsername);
      }

      const newUser = new User(
        isMail
          ? {
              email,
              ...(normalizedUsername ? { username: normalizedUsername } : {}),
            }
          : {
              phoneNumber: phone,
              ...(normalizedUsername ? { username: normalizedUsername } : {}),
            },
      );

      return issueOtp(newUser, isMail ? email : phone, isMail);
    }

    if (normalizedUsername && !user.username) {
      await ensureUsernameAvailable(normalizedUsername);
      user.username = normalizedUsername;
    }

    return issueOtp(user, isMail ? email : phone, isMail);
  }

  throw new Error("Invalid intent");
};

export const sendSignupOTP = async ({ username, identifier }) => {
  return sendOtp({ username, identifier, intent: "signup" });
};

export const sendLoginOTP = async (identifier) => {
  return sendOtp({ identifier, intent: "login" });
};

export const verifyOTPAndCreateTokens = async (
  identifier,
  otp,
  sessionMeta,
  options = {},
) => {
  if (!identifier || !otp) {
    throw new Error("Identifier and OTP required");
  }

  const { isMail, email, phone } = resolveIdentifier(identifier);

  const user = await User.findOne(isMail ? { email } : { phoneNumber: phone });

  if (!user) throw new Error("User not found");
  if (user.isActive === false) throw new Error("Account disabled");
  if (user.isLocked) throw new Error("Account locked");

  // OTP existence
  if (!user.otpHash) {
    throw new Error("OTP not found or already used");
  }

  // OTP expiry
  if (!user.otpExpires || user.otpExpires < Date.now()) {
    throw new Error("OTP expired");
  }

  // OTP compare
  const isMatch = await bcrypt.compare(String(otp), user.otpHash);
  if (!isMatch) {
    user.otpAttempts += 1;

    if (user.otpAttempts >= Number(process.env.OTP_MAX_RETRIES || 3)) {
      user.isLocked = true;
    }

    await user.save();
    throw new Error("Invalid OTP");
  }

  // OTP success -> clear
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.lastLogin = Date.now();

  if (isMail) {
    user.emailVerified = true;
  } else {
    user.phoneVerified = true;
  }

  const normalizedIntent = String(options.intent || "")
    .trim()
    .toLowerCase();

  if (normalizedIntent === "admin") {
    // ensure admin profile exists (you already do)
    await ensureAdminProfile(user._id);
  }
  if (normalizedIntent && normalizedIntent !== "admin") {
    throw new Error("Invalid intent");
  }

  if (normalizedIntent === "admin") {
    if (user.role !== "admin" && user.role !== "super_admin") {
      user.role = "admin";
    }
    await ensureAdminProfile(user._id);
  }

  // JWT Tokens
  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { userId: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );

  // Hash refresh token
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  user.refreshTokens = user.refreshTokens || [];

  // New device detect
  const sessionInfo = sessionMeta || {};
  const newDevice = isNewDevice(user, sessionInfo.ip, sessionInfo.userAgent);

  user.refreshTokens.push({
    token: refreshTokenHash,
    ip: sessionInfo.ip,
    userAgent: sessionInfo.userAgent,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });

  if (newDevice && user.email) {
    await sendNewDeviceLoginAlert({
      email: user.email,
      ip: sessionInfo.ip,
      userAgent: sessionInfo.userAgent,
      time: new Date(),
    });
  }

  await user.save();

  return { accessToken, refreshToken, user };
};
