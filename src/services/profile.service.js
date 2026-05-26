// services/profileVerify.service.js
import User from "../models/user_models/User.js";
import bcrypt from "bcryptjs";
import { generateOTP } from "../utils/otpUtils.js";
import { sendVerifyOtpEmail } from "./mail.service.js";
import { sendSMS } from "./sms.service.js";
import { isEmail } from "../utils/validatorUtils.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

async function getProfileOtpConfig() {
  const values = await getPlatformConfigValues([
    "OTP_EXPIRY_MINUTES",
    "OTP_MAX_RETRIES",
  ]);

  return {
    otpExpiryMinutes: Number(values.OTP_EXPIRY_MINUTES || 10),
    otpMaxRetries: Number(values.OTP_MAX_RETRIES || 3),
  };
}

export const sendProfileOtp = async (userId, identifier) => {
  const otpConfig = await getProfileOtpConfig();

  if (!userId) throw new Error("User id required");
  if (!identifier) throw new Error("Identifier required");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const trimmed = String(identifier).trim();
  const isMail = isEmail(trimmed);
  const target = isMail ? trimmed.toLowerCase() : normalizePhone(trimmed);

  // ensure target not used by another user
  if (isMail) {
    const other = await User.findOne({ email: target, _id: { $ne: userId } });
    if (other) throw new Error("Email already in use");
  } else {
    const other = await User.findOne({ phoneNumber: target, _id: { $ne: userId } });
    if (other) throw new Error("Phone number already in use");
  }

  // Generate OTP and save hash on user
  const otp = generateOTP();
  const otpHash = await bcrypt.hash(otp, 12);

  user.otpHash = otpHash;
  user.otpExpires = Date.now() + otpConfig.otpExpiryMinutes * 60 * 1000;
  user.otpAttempts = 0;

  // store pending field (do not overwrite primary until verification)
  if (isMail) {
    user.pendingEmail = target;
    user.pendingEmailRequestedAt = new Date();
  } else {
    user.pendingPhone = target;
    user.pendingPhoneRequestedAt = new Date();
  }

  await user.save();

  // send OTP
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

  return true;
};

export const confirmProfileOtp = async (userId, identifier, otp) => {
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

  const isMatch = await bcrypt.compare(String(otp), user.otpHash);
  if (!isMatch) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    if (user.otpAttempts >= otpConfig.otpMaxRetries) {
      user.isLocked = true;
    }
    await user.save();
    throw new Error("Invalid OTP");
  }

  // OTP ok -> apply the pending identifier (only if it matches)
  const trimmed = String(identifier).trim();
  const isMail = isEmail(trimmed);
  const target = isMail ? trimmed.toLowerCase() : normalizePhone(trimmed);

  // If the user has a pendingEmail/Phone and it matches the requested identifier, apply it.
  if (isMail) {
    if (user.pendingEmail && user.pendingEmail === target) {
      user.email = target;
      user.emailVerified = true;
      user.pendingEmail = undefined;
      user.pendingEmailRequestedAt = undefined;
    } else {
      // The confirm identifier doesn't match the pending one; still allow if you want:
      // For safety, require that the identifier matches pendingEmail
      throw new Error("No pending email to verify or identifier mismatch");
    }
  } else {
    if (user.pendingPhone && user.pendingPhone === target) {
      user.phoneNumber = target;
      user.phoneVerified = true;
      user.pendingPhone = undefined;
      user.pendingPhoneRequestedAt = undefined;
    } else {
      throw new Error("No pending phone to verify or identifier mismatch");
    }
  }

  // clear otp fields
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.lastLogin = user.lastLogin || Date.now();

  await user.save();

  return true;
};
