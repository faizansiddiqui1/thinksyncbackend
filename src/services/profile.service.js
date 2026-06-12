import bcrypt from "bcryptjs";

import User from "../models/user_models/User.js";
import { generateOTP } from "../utils/otpUtils.js";
import { sendVerifyOtpEmail } from "./mail.service.js";
import { sendSMS } from "./sms.service.js";
import { isEmail } from "../utils/validatorUtils.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";
import {
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
} from "./securityEvent.service.js";

async function getProfileOtpConfig() {
  const values = await getPlatformConfigValues([
    "OTP_EXPIRY_MINUTES",
    "OTP_MAX_RETRIES",
    "ACCOUNT_LOCK_TIME_MS",
  ]);

  return {
    otpExpiryMinutes: Number(values.OTP_EXPIRY_MINUTES || 10),
    otpMaxRetries: Number(values.OTP_MAX_RETRIES || 3),
    lockTimeMs: Number(values.ACCOUNT_LOCK_TIME_MS || 15 * 60 * 1000),
  };
}

function normalizeIdentifier(identifier) {
  const trimmed = String(identifier || "").trim();
  const mail = isEmail(trimmed);
  return {
    isMail: mail,
    target: mail ? trimmed.toLowerCase() : normalizePhone(trimmed),
  };
}

function inferContactType(user, target, isMail, requestedType = "") {
  const explicit = String(requestedType || "").trim().toLowerCase();
  if (explicit === "recovery") return "recovery";
  if (explicit === "primary") return "primary";

  if (isMail) {
    if (user.pendingRecoveryEmail && user.pendingRecoveryEmail === target) {
      return "recovery";
    }
    return "primary";
  }

  if (user.pendingRecoveryPhone && user.pendingRecoveryPhone === target) {
    return "recovery";
  }
  return "primary";
}

async function ensureIdentifierAvailable(userId, target, isMail) {
  const query = isMail
    ? {
        _id: { $ne: userId },
        $or: [
          { email: target },
          { recoveryEmail: target },
          { pendingEmail: target },
          { pendingRecoveryEmail: target },
        ],
      }
    : {
        _id: { $ne: userId },
        $or: [
          { phoneNumber: target },
          { recoveryPhone: target },
          { pendingPhone: target },
          { pendingRecoveryPhone: target },
        ],
      };

  const other = await User.findOne(query).lean();
  if (other) {
    throw new Error(isMail ? "Email already in use" : "Phone number already in use");
  }
}

export const sendProfileOtp = async (
  userId,
  identifier,
  options = {},
) => {
  const otpConfig = await getProfileOtpConfig();

  if (!userId) throw new Error("User id required");
  if (!identifier) throw new Error("Identifier required");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const { isMail, target } = normalizeIdentifier(identifier);
  const contactType = inferContactType(
    user,
    target,
    isMail,
    options.contactType || "",
  );

  await ensureIdentifierAvailable(userId, target, isMail);

  const otp = generateOTP();
  user.otpHash = await bcrypt.hash(otp, 12);
  user.otpExpires = Date.now() + otpConfig.otpExpiryMinutes * 60 * 1000;
  user.otpAttempts = 0;

  if (contactType === "recovery") {
    if (isMail) {
      user.pendingRecoveryEmail = target;
      user.pendingRecoveryEmailRequestedAt = new Date();
    } else {
      user.pendingRecoveryPhone = target;
      user.pendingRecoveryPhoneRequestedAt = new Date();
    }
  } else if (isMail) {
    user.pendingEmail = target;
    user.pendingEmailRequestedAt = new Date();
  } else {
    user.pendingPhone = target;
    user.pendingPhoneRequestedAt = new Date();
  }

  await user.save();

  if (isMail) {
    await sendVerifyOtpEmail({
      to: target,
      userName: user.username || "there",
      otp,
      otpExpiryMinutes: otpConfig.otpExpiryMinutes,
    });
  } else {
    await sendSMS(target, otp);
  }

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType: SECURITY_EVENT_TYPES.CONTACT_VERIFICATION_REQUESTED,
    metadata: {
      contactType,
      channel: isMail ? "email" : "phone",
      target,
    },
  });

  return {
    success: true,
    contactType,
    target,
  };
};

export const confirmProfileOtp = async (
  userId,
  identifier,
  otp,
  options = {},
) => {
  const otpConfig = await getProfileOtpConfig();

  if (!userId) throw new Error("User id required");
  if (!identifier || !otp) throw new Error("Identifier and OTP required");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (!user.otpHash) {
    throw new Error("OTP not found or already used");
  }
  if (!user.otpExpires || user.otpExpires < Date.now()) {
    throw new Error("OTP expired");
  }

  const { isMail, target } = normalizeIdentifier(identifier);
  const isMatch = await bcrypt.compare(String(otp), user.otpHash);
  if (!isMatch) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= otpConfig.otpMaxRetries) {
      user.lockUntil = Date.now() + otpConfig.lockTimeMs;
    }
    await user.save();
    throw new Error("Invalid OTP");
  }

  let applied = false;
  let eventType = "";

  if (isMail && user.pendingEmail && user.pendingEmail === target) {
    user.email = target;
    user.emailVerified = true;
    user.pendingEmail = undefined;
    user.pendingEmailRequestedAt = undefined;
    applied = true;
    eventType = SECURITY_EVENT_TYPES.EMAIL_CHANGED;
  } else if (!isMail && user.pendingPhone && user.pendingPhone === target) {
    user.phoneNumber = target;
    user.phoneVerified = true;
    user.pendingPhone = undefined;
    user.pendingPhoneRequestedAt = undefined;
    applied = true;
    eventType = SECURITY_EVENT_TYPES.PHONE_CHANGED;
  } else if (isMail && user.pendingRecoveryEmail && user.pendingRecoveryEmail === target) {
    const isNew = !user.recoveryEmail;
    user.recoveryEmail = target;
    user.recoveryEmailVerified = true;
    user.pendingRecoveryEmail = "";
    user.pendingRecoveryEmailRequestedAt = undefined;
    applied = true;
    eventType = isNew
      ? SECURITY_EVENT_TYPES.RECOVERY_EMAIL_ADDED
      : SECURITY_EVENT_TYPES.RECOVERY_EMAIL_CHANGED;
  } else if (
    !isMail &&
    user.pendingRecoveryPhone &&
    user.pendingRecoveryPhone === target
  ) {
    const isNew = !user.recoveryPhone;
    user.recoveryPhone = target;
    user.recoveryPhoneVerified = true;
    user.pendingRecoveryPhone = "";
    user.pendingRecoveryPhoneRequestedAt = undefined;
    applied = true;
    eventType = isNew
      ? SECURITY_EVENT_TYPES.RECOVERY_PHONE_ADDED
      : SECURITY_EVENT_TYPES.RECOVERY_PHONE_CHANGED;
  }

  if (!applied) {
    throw new Error("No pending contact to verify or identifier mismatch");
  }

  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;

  await user.save();

  await logSecurityEvent({
    userId: user._id,
    actorId: user._id,
    eventType,
    metadata: {
      target,
      contactType:
        eventType.includes("recovery") ? "recovery" : "primary",
    },
  });

  if (eventType.includes("recovery")) {
    await logSecurityEvent({
      userId: user._id,
      actorId: user._id,
      eventType: SECURITY_EVENT_TYPES.RECOVERY_CONTACT_VERIFIED,
      metadata: {
        target,
        channel: isMail ? "email" : "phone",
      },
    });
  }

  return true;
};
