// services/user.service.js
import User from "../models/user_models/User.js";
import { sendProfileOtp } from "./profile.service.js";
import { normalizePhone } from "../utils/phoneUtils.js";

const normalizeUsername = (username) => {
  if (username === undefined || username === null) return null;
  const n = String(username).trim();
  return n || null;
};

export const ensureUsernameAvailable = async (username, exceptUserId = null) => {
  if (!username) return;
  const existing = await User.findOne({
    username: username.toLowerCase(),
    _id: { $ne: exceptUserId },
  });
  if (existing) {
    throw new Error("Username already taken");
  }
};

export const updateUserProfile = async (userId, updates = {}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const allowed = ["username", "displayName", "avatarUrl", "bio", "website"]; // extend as needed
  const payload = {};

  // handle username change
  if (updates.username !== undefined) {
    const normalized = normalizeUsername(updates.username);
    if (normalized && normalized !== user.username) {
      await ensureUsernameAvailable(normalized, userId);
      payload.username = normalized;
    } else if (normalized === null) {
      // ignore empty username
    }
  }

  // handle simple fields
  allowed.forEach((k) => {
    if (updates[k] !== undefined) payload[k] = updates[k];
  });

  // handle email change request
  if (updates.email !== undefined) {
    const newEmail = updates.email ? String(updates.email).trim().toLowerCase() : null;
    if (newEmail && newEmail !== user.email) {
      // send OTP and save pendingEmail (handled by sendProfileOtp)
      await sendProfileOtp(userId, newEmail);
      // Do not set payload.email directly; sendProfileOtp saves pendingEmail on user
      return { message: "Pending email set. Verify the email with OTP.", pending: true };
    }
  }

  // handle phone change request
  if (updates.phoneNumber !== undefined) {
    const raw = updates.phoneNumber ? String(updates.phoneNumber).trim() : null;
    const newPhone = raw ? normalizePhone(raw) : null;
    if (newPhone && newPhone !== user.phoneNumber) {
      await sendProfileOtp(userId, newPhone);
      return { message: "Pending phone set. Verify the phone with OTP.", pending: true };
    }
  }

  // apply payload updates
  if (Object.keys(payload).length > 0) {
    Object.assign(user, payload);
    await user.save();
  }

  return { message: "Profile updated", user: user.toJSON() };
};

export const changeUserPassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) throw new Error("Both current and new passwords are required");

  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User not found");

  const match = await user.comparePassword(currentPassword); // implement or use bcrypt.compare
  // if comparePassword method not present:
  // const match = await bcrypt.compare(currentPassword, user.password);

  if (!match) throw new Error("Current password is incorrect");

  // hash new password (if model uses pre-save hook, simply set)
  user.password = newPassword;
  // ensure update mechanism hashes password; otherwise hash here with bcrypt
  await user.save();

  return { message: "Password changed successfully" };
};