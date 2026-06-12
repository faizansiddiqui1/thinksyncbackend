import User from "../models/user_models/User.js";
import Role from "../models/super_admin_models/Role.js";
import Consultant from "../models/super_admin_models/Consultant.js";
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
import { syncAllActiveBookingsForUser } from "./calendarSync.service.js";
import { normalizeUsername } from "../utils/usernameUtils.js";
import {
  createTwoFactorLoginChallenge,
  getTrustedDeviceState,
  readTwoFactorLoginChallenge,
  rememberTrustedDevice,
  touchTrustedDevice,
  verifyTwoFactorCredential,
} from "./accountSecurity.service.js";
import {
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
} from "./securityEvent.service.js";

async function getAuthRuntimeConfig() {
  const values = await getPlatformConfigValues([
    "OTP_EXPIRY_MINUTES",
    "OTP_MAX_RETRIES",
    "ACCOUNT_LOCK_TIME_MS",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRY",
    "JWT_REFRESH_EXPIRY",
  ]);

  return {
    otpExpiryMinutes: Number(values.OTP_EXPIRY_MINUTES || 10),
    otpMaxRetries: Number(values.OTP_MAX_RETRIES || 3),
    lockTimeMs: Number(values.ACCOUNT_LOCK_TIME_MS || 15 * 60 * 1000),
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

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPhoneRegex = (phone = "") => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const local = normalizePhone(digits);
  if (!local) return null;
  return new RegExp(`${local.split("").map(escapeRegex).join("\\D*")}$`);
};

const buildPhoneCandidates = (phone = "") => {
  const local = normalizePhone(phone);
  if (!local) return [];
  return [...new Set([local, `91${local}`, `+91${local}`, phone])].filter(Boolean);
};

const buildIdentifierQuery = ({ isMail, email, phone }) => {
  if (isMail) return { email };

  const phoneRegex = buildPhoneRegex(phone);
  const phoneClauses = buildPhoneCandidates(phone).map((candidate) => ({
    phoneNumber: candidate,
  }));

  if (phoneRegex) phoneClauses.push({ phoneNumber: { $regex: phoneRegex } });

  return { $or: phoneClauses };
};

const findUserByIdentifier = ({ isMail, email, phone }) => {
  return User.findOne(buildIdentifierQuery({ isMail, email, phone }));
};

const buildConsultantIdentifierQuery = ({ isMail, email, phone }) => {
  const clauses = [];
  if (isMail && email) clauses.push({ email });

  if (!isMail && phone) {
    const phoneRegex = buildPhoneRegex(phone);
    buildPhoneCandidates(phone).forEach((candidate) => {
      clauses.push({ phone: candidate });
    });
    if (phoneRegex) clauses.push({ phone: { $regex: phoneRegex } });
  }

  if (!clauses.length) return null;

  return {
    isActive: { $ne: false },
    $or: clauses,
  };
};

const buildConsultantUsername = (consultant, identifier) => {
  const source =
    String(consultant?.email || identifier.email || "").split("@")[0] ||
    consultant?.name ||
    "consultant";

  const normalized = String(source)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 12);

  return `${normalized || "consultant"}_${Date.now().toString(36)}`.slice(0, 20);
};

const syncConsultantLoginUser = async (identifier, user = null) => {
  const query = buildConsultantIdentifierQuery(identifier);
  if (!query) return user;

  const consultant = await Consultant.findOne(query);
  if (!consultant) return user;

  let loginUser = user;

  if (!loginUser) {
    if (consultant.email) {
      loginUser = await findUserByIdentifier({
        isMail: true,
        email: consultant.email,
        phone: null,
      });
    }

    if (!loginUser && consultant.phone) {
      loginUser = await findUserByIdentifier({
        isMail: false,
        email: null,
        phone: normalizePhone(consultant.phone),
      });
    }
  }

  if (!loginUser) {
    loginUser = await User.create({
      email: consultant.email || identifier.email || undefined,
      phoneNumber: normalizePhone(consultant.phone || identifier.phone) || undefined,
      username: buildConsultantUsername(consultant, identifier),
      role: "consultant",
      isActive: true,
    });
  }

  let userChanged = false;
  if (loginUser.role === "user") {
    loginUser.role = "consultant";
    loginUser.isActive = true;
    userChanged = true;
  }

  if (!loginUser.email && consultant.email) {
    loginUser.email = consultant.email;
    userChanged = true;
  }

  if (!loginUser.phoneNumber && consultant.phone) {
    loginUser.phoneNumber = normalizePhone(consultant.phone);
    userChanged = true;
  }

  if (userChanged) {
    await loginUser.save();
  }

  if (!consultant.linkedUser || String(consultant.linkedUser) !== String(loginUser._id)) {
    consultant.linkedUser = loginUser._id;
    await consultant.save();
  }

  return loginUser;
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

  // Employee login sync: keep connected calendar providers current.
  try {
    await syncAllActiveBookingsForUser(user._id);
  } catch (err) {
    console.error("employee calendar sync error:", err?.message || err);
  }

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

function validatePasswordStrength(password = "") {
  const value = String(password || "");
  if (value.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  const checks = [
    /[A-Z]/.test(value),
    /[a-z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ].filter(Boolean).length;

  if (checks < 3) {
    throw new Error(
      "Password must include at least three of: uppercase, lowercase, number, special character",
    );
  }
}

async function maybeStartTwoFactorChallenge(
  user,
  company,
  sessionMeta = {},
  trustedDeviceToken = "",
) {
  if (!user?.securityPreferences?.twoFactorEnabled) {
    return null;
  }

  const trusted = await getTrustedDeviceState(user, trustedDeviceToken);
  if (trusted.trusted) {
    await touchTrustedDevice(user, trustedDeviceToken);
    return null;
  }

  const challengeToken = await createTwoFactorLoginChallenge(user, sessionMeta);
  return {
    requiresTwoFactor: true,
    challengeToken,
    methods: ["totp", "backup_code"],
    user: user.toJSON(),
    company: company || user.companyId || null,
  };
}

export async function finalizeAuthenticatedSession(
  user,
  sessionMeta = {},
  { company = null } = {},
) {
  const authConfig = await getAuthRuntimeConfig();
  const normalizedSession = sessionMeta || {};
  const lastLoginBefore = user.lastLogin || null;

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

  user.refreshTokens = user.refreshTokens || [];
  const newDevice = isNewDevice(
    user,
    normalizedSession.ip,
    normalizedSession.userAgent,
  );

  user.refreshTokens.push({
    token: refreshTokenHash,
    ip: normalizedSession.ip,
    userAgent: normalizedSession.userAgent,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });
  user.lastLogin = new Date();
  user.loginAttempts = 0;
  user.lockUntil = undefined;

  await user.save();

  if (newDevice && user.email) {
    await sendNewDeviceLoginAlert({
      email: user.email,
      ip: normalizedSession.ip,
      userAgent: normalizedSession.userAgent,
      time: new Date(),
    });
    await logSecurityEvent({
      userId: user._id,
      actorId: user._id,
      eventType: SECURITY_EVENT_TYPES.NEW_DEVICE_LOGIN,
      ip: normalizedSession.ip,
      userAgent: normalizedSession.userAgent,
    });
  }

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.LOGIN_SUCCESS,
    ip: normalizedSession.ip,
    userAgent: normalizedSession.userAgent,
  });

  if (Boolean(user.email) && !lastLoginBefore && user.role === "user") {
    sendWelcomeEmail({ user }).catch((error) => {
      console.error("welcome email failed:", error.message);
    });
  }

  return {
    accessToken,
    refreshToken,
    user,
    company: company || user.companyId || null,
  };
}

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

  let user = await findUserByIdentifier({ isMail, email, phone });

  if (normalizedIntent === "login") {
    if (!user) {
      throw new Error("Account not found. Please signup.");
    }
    await issueOtp(user, isMail ? email : phone, isMail, tenant);
    return { role: user.role };
  }

  if (normalizedIntent === "signup") {
    normalizeUsername(normalizedUsername, { required: true });

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
    normalizeUsername(normalizedUsername, { required: true });

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
    user = await syncConsultantLoginUser({ isMail, email, phone }, user);

    if (!user) {
      throw new Error("Admin account not found");
    }

    const allowedRoles = ["pending_admin", "admin", "super_admin", "consultant"];
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

export const registerWithPassword = async ({
  username,
  identifier,
  password,
  confirmPassword,
  intent = "signup",
  tenant = null,
}) => {
  const { isMail, email, phone } = resolveIdentifier(identifier);
  const normalizedUsername = normalizeUsername(username, { required: true });
  const normalizedIntent = String(intent || "signup").trim().toLowerCase();

  if (!normalizedUsername) {
    throw new Error("Username is required");
  }

  if (!password || !confirmPassword) {
    throw new Error("Password and confirm password are required");
  }

  if (password !== confirmPassword) {
    throw new Error("Password and confirm password must match");
  }

  validatePasswordStrength(password);

  const existing = await findUserByIdentifier({ isMail, email, phone });
  if (existing) {
    throw new Error("Account already exists. Please login.");
  }

  await ensureUsernameAvailable(normalizedUsername);

  const role = normalizedIntent === "admin-signup" ? "pending_admin" : "user";
  const user = new User(
    isMail
      ? {
          username: normalizedUsername,
          email,
          role,
          password,
        }
      : {
          username: normalizedUsername,
          phoneNumber: phone,
          role,
          password,
        },
  );

  await user.save();

  if (normalizedIntent === "admin-signup") {
    await ensureAdminProfile(user._id);
  }

  await issueOtp(user, isMail ? email : phone, isMail, tenant);

  return {
    success: true,
    message: "Account created. Verify the OTP to activate login.",
    role: user.role,
    identifier: isMail ? email : phone,
  };
};

export const loginWithPassword = async ({
  identifier,
  password,
  sessionMeta = {},
  intent = "login",
  trustedDeviceToken = "",
}) => {
  if (!identifier || !password) {
    throw new Error("Identifier and password are required");
  }

  const { isMail, email, phone } = resolveIdentifier(identifier);
  const normalizedIntent = String(intent || "login").trim().toLowerCase();
  let user = await findUserByIdentifier({ isMail, email, phone });

  if (normalizedIntent === "admin-login") {
    user = await syncConsultantLoginUser({ isMail, email, phone }, user);
  }

  if (!user) {
    throw new Error("Invalid credentials");
  }

  user = await User.findById(user._id)
    .select("+password +refreshTokens +twoFactor +trustedDevices")
    .populate("companyId");

  if (!user || user.isActive === false) {
    throw new Error("Account disabled");
  }

  if (user.isLocked) {
    throw new Error("Account locked. Try again later.");
  }

  if (!user.password) {
    throw new Error("Password login is not enabled for this account yet");
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
    await user.incLoginAttempts();
    await logSecurityEvent({
      userId: user._id,
      actorId: user._id,
      eventType: SECURITY_EVENT_TYPES.LOGIN_FAILED,
      status: "failure",
      ip: sessionMeta?.ip || "",
      userAgent: sessionMeta?.userAgent || "",
      metadata: {
        reason: "invalid_password",
      },
    });
    throw new Error("Invalid credentials");
  }

  if (user.loginAttempts > 0 || user.lockUntil) {
    user.loginAttempts = 0;
    user.lockUntil = undefined;
  }

  if (normalizedIntent === "admin-login") {
    const allowedRoles = ["pending_admin", "admin", "super_admin", "consultant"];
    const hasAdminRoleAccess = allowedRoles.includes(user.role);
    const hasRbacAdminAccess = await hasAssignedRbacPermissions(user);
    if (!hasAdminRoleAccess && !hasRbacAdminAccess) {
      throw new Error("You are not authorized for admin login");
    }
  }

  const twoFactorPending = await maybeStartTwoFactorChallenge(
    user,
    user.companyId || null,
    sessionMeta,
    trustedDeviceToken,
  );

  if (twoFactorPending) {
    await user.save();
    return twoFactorPending;
  }

  return finalizeAuthenticatedSession(user, sessionMeta, {
    company: user.companyId || null,
  });
};

export const completeTwoFactorLogin = async (
  challengeToken,
  { code, backupCode, rememberDevice = false, deviceLabel = "" } = {},
  { trustedDeviceToken = "" } = {},
) => {
  if (!challengeToken) {
    throw new Error("Two-factor challenge is required");
  }

  const payload = await readTwoFactorLoginChallenge(challengeToken);
  if (payload?.purpose !== "two_factor_login" || !payload?.userId) {
    throw new Error("Two-factor challenge is invalid");
  }

  const user = await User.findById(payload.userId)
    .select("+refreshTokens +twoFactor +trustedDevices")
    .populate("companyId");

  if (!user || user.isActive === false) {
    throw new Error("Account disabled");
  }

  const trusted = await getTrustedDeviceState(user, trustedDeviceToken);
  if (trusted.trusted) {
    await touchTrustedDevice(user, trustedDeviceToken);
    return finalizeAuthenticatedSession(user, payload.sessionMeta || {}, {
      company: user.companyId || null,
    });
  }

  const verification = await verifyTwoFactorCredential(user, { code, backupCode });
  if (!verification.success) {
    throw new Error("Authenticator code or backup code is invalid");
  }

  let trustedDevice = null;
  if (rememberDevice) {
    trustedDevice = await rememberTrustedDevice(
      user,
      payload.sessionMeta || {},
      deviceLabel,
    );
  }

  const result = await finalizeAuthenticatedSession(user, payload.sessionMeta || {}, {
    company: user.companyId || null,
  });

  return {
    ...result,
    trustedDevice,
  };
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

  const user = await findUserByIdentifier({ isMail, email, phone })
    .select("+refreshTokens +twoFactor +trustedDevices")
    .populate("companyId");

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
      user.lockUntil = Date.now() + authConfig.lockTimeMs;
    }

    await user.save();
    await logSecurityEvent({
      userId: user._id,
      actorId: user._id,
      eventType: SECURITY_EVENT_TYPES.LOGIN_FAILED,
      status: "failure",
      ip: sessionMeta?.ip || "",
      userAgent: sessionMeta?.userAgent || "",
      metadata: {
        reason: "invalid_otp",
      },
    });
    throw new Error("Invalid OTP");
  }

  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;

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

  const isAdminRoleUser =
    user.role === "admin" || user.role === "super_admin" || user.role === "consultant";
  const shouldEnsureAdminProfile = user.role === "admin" || user.role === "super_admin";
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

    if (shouldEnsureAdminProfile || normalizedIntent === "admin-signup") {
      await ensureAdminProfile(user._id);
    }

    if (!isAdminRoleUser && normalizedIntent === "admin-signup") {
      user.role = "pending_admin";
    }
  }

  const twoFactorPending = await maybeStartTwoFactorChallenge(
    user,
    user.companyId || null,
    sessionMeta,
    options.trustedDeviceToken || "",
  );
  if (twoFactorPending) {
    await user.save();
    return twoFactorPending;
  }

  return finalizeAuthenticatedSession(user, sessionMeta, {
    company: user.companyId || null,
  });
};
