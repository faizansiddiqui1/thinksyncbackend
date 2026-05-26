import User from "../models/user_models/User.js";
import Role from "../models/super_admin_models/Role.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import { generateOTP } from "../utils/otpUtils.js";
import {
  sendOtpEmail,
  sendWelcomeEmail,
} from "./mail.service.js";
import { sendSMS } from "./sms.service.js";
import { isEmail } from "../utils/validatorUtils.js";
import { isNewDevice } from "../utils/helper.js";
import { sendNewDeviceLoginAlert } from "./alert.service.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

async function getAuthRuntimeConfig() {
  const values = await getPlatformConfigValues([
    "OTP_EXPIRY_MINUTES",
    "OTP_MAX_RETRIES",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRY",
    "JWT_REFRESH_EXPIRY",
  ]);

  return {
    otpExpiryMinutes: Number(values.OTP_EXPIRY_MINUTES || 10),
    otpMaxRetries: Number(values.OTP_MAX_RETRIES || 3),
    accessSecret: values.JWT_ACCESS_SECRET,
    refreshSecret: values.JWT_REFRESH_SECRET,
    accessExpiry: values.JWT_ACCESS_EXPIRY || "60m",
    refreshExpiry: values.JWT_REFRESH_EXPIRY || "7d",
  };
}

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

const hasAssignedRbacPermissions = async (user) => {
  if (!user?.customRoles?.length) {
    return false;
  }

  const roles = await Role.find({ _id: { $in: user.customRoles }, isActive: true });
  return roles.some(
    (role) => Array.isArray(role.permissions) && role.permissions.length > 0,
  );
};

const issueOtp = async (user, target, isMail, tenant) => {
  const authConfig = await getAuthRuntimeConfig();

  if (user.isActive === false) {
    throw new Error("Account disabled");
  }

  if (user.isLocked) {
    throw new Error("Account locked. Try again later.");
  }

  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 12);

  user.otpHash = otpHash;
  user.otpExpires = Date.now() + authConfig.otpExpiryMinutes * 60 * 1000;
  user.otpAttempts = 0;
  await user.save();

  if (isMail) {
    await sendOtpEmail({
      tenant,
      to: target,
      userName: user.username || "there",
      otp,
      otpExpiryMinutes: authConfig.otpExpiryMinutes,
    });
  } else {
    await sendSMS(target, otp, { tenant });
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
    kyc: { status: "not_submitted", submittedAt: new Date() },
  });
};

export const sendOtp = async ({
  username,
  identifier,
  intent = "login",
  tenant = null,
}) => {
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
    await issueOtp(user, isMail ? email : phone, isMail, tenant);
    return { role: user.role };
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

    return issueOtp(newUser, isMail ? email : phone, isMail, tenant);
  }

  if (normalizedIntent === "admin-signup") {
    if (!normalizedUsername) {
      throw new Error("Username is required");
    }

    if (user) {
      throw new Error("Admin account already exists. Please login.");
    }

    await ensureUsernameAvailable(normalizedUsername);

    const newAdmin = new User(
      isMail
        ? {
            username: normalizedUsername,
            email,
            role: "pending_admin",
          }
        : {
            username: normalizedUsername,
            phoneNumber: phone,
            role: "pending_admin",
          },
    );

    return issueOtp(newAdmin, isMail ? email : phone, isMail, tenant);
  }

  if (normalizedIntent === "admin-login") {
    if (!user) {
      throw new Error("Admin account not found");
    }

    const allowedRoles = ["pending_admin", "admin", "super_admin"];
    const hasAdminRoleAccess = allowedRoles.includes(user.role);
    const hasRbacAdminAccess = await hasAssignedRbacPermissions(user);

    if (!hasAdminRoleAccess && !hasRbacAdminAccess) {
      throw new Error("You are not authorized for admin login");
    }

    return issueOtp(user, isMail ? email : phone, isMail, tenant);
  }

  throw new Error("Invalid intent");
};

export const sendSignupOTP = async ({
  username,
  identifier,
  tenant = null,
}) => {
  return sendOtp({ username, identifier, intent: "signup", tenant });
};

export const sendLoginOTP = async (identifier, tenant = null) => {
  return sendOtp({ identifier, intent: "login", tenant });
};

export const verifyOTPAndCreateTokens = async (
  identifier,
  otp,
  sessionMeta,
  options = {},
) => {
  const authConfig = await getAuthRuntimeConfig();

  if (!identifier || !otp) {
    throw new Error("Identifier and OTP required");
  }

  const { isMail, email, phone } = resolveIdentifier(identifier);

  const user = await User.findOne(
    isMail ? { email } : { phoneNumber: phone },
  ).populate("companyId");

  if (!user) throw new Error("User not found");
  if (user.isActive === false) throw new Error("Account disabled");
  if (user.isLocked) throw new Error("Account locked");

  if (!user.otpHash) {
    throw new Error("OTP not found or already used");
  }

  if (!user.otpExpires || user.otpExpires < Date.now()) {
    throw new Error("OTP expired");
  }

  const isMatch = await bcrypt.compare(String(otp), user.otpHash);
  if (!isMatch) {
    user.otpAttempts += 1;

    if (user.otpAttempts >= authConfig.otpMaxRetries) {
      user.isLocked = true;
    }

    await user.save();
    throw new Error("Invalid OTP");
  }

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

  const isAdminFlow = ["admin", "admin-login", "admin-signup"].includes(
    normalizedIntent,
  );

  const isAdminRoleUser = user.role === "admin" || user.role === "super_admin";
  const isPendingAdminUser = user.role === "pending_admin";
  const isCustomRbacUser = await hasAssignedRbacPermissions(user);

  if (normalizedIntent) {
    if (!isAdminFlow) {
      throw new Error("Invalid intent");
    }

    if (
      !isAdminRoleUser &&
      !isPendingAdminUser &&
      !isCustomRbacUser &&
      normalizedIntent !== "admin-signup"
    ) {
      throw new Error("Invalid intent");
    }

    if (isAdminRoleUser || normalizedIntent === "admin-signup") {
      await ensureAdminProfile(user._id);
    }

    if (!isAdminRoleUser && normalizedIntent === "admin-signup") {
      user.role = "pending_admin";
    }
  }

  const accessToken = jwt.sign(
    { userId: user._id },
    authConfig.accessSecret,
    { expiresIn: authConfig.accessExpiry },
  );

  const refreshToken = jwt.sign(
    { userId: user._id },
    authConfig.refreshSecret,
    { expiresIn: authConfig.refreshExpiry },
  );

  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const shouldSendWelcomeEmail =
    Boolean(user.email) &&
    !user.lastLogin &&
    !isAdminFlow;

  user.refreshTokens = user.refreshTokens || [];

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

  if (shouldSendWelcomeEmail) {
    sendWelcomeEmail({ user }).catch((error) => {
      console.error("welcome email failed:", error.message);
    });
  }

  return {
    accessToken,
    refreshToken,
    user,
    company: user.companyId || null, // 🔥 ADD THIS
  };
};
