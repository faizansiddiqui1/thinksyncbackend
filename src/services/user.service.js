// services/user.service.js
import User from "../models/user_models/User.js";
import { sendProfileOtp } from "./profile.service.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { normalizeUsername } from "../utils/usernameUtils.js";
import { getPresignForImage } from "./spaceMedia.service.js";
import {
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";

const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function cleanOptionalText(value, maxLength) {
  if (value === undefined) return undefined;
  return String(value || "").trim().slice(0, maxLength);
}

function cleanWebsite(value) {
  const website = cleanOptionalText(value, 240);
  if (!website) return "";

  let parsed;
  try {
    parsed = new URL(website);
  } catch {
    throw new Error("Website must be a valid URL including https://");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Website must use http:// or https://");
  }

  return parsed.toString();
}

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

  const payload = {};

  // handle username change
  if (updates.username !== undefined) {
    const normalized = normalizeUsername(updates.username, { required: true });
    if (normalized !== user.username) {
      await ensureUsernameAvailable(normalized, userId);
      payload.username = normalized;
    }
  }

  if (updates.displayName !== undefined) {
    payload.displayName = cleanOptionalText(updates.displayName, 70);
  }

  if (updates.bio !== undefined) {
    payload.bio = cleanOptionalText(updates.bio, 240);
  }

  if (updates.website !== undefined) {
    payload.website = cleanWebsite(updates.website);
  }

  if (Object.keys(payload).length > 0) {
    Object.assign(user, payload);
    await user.save();
  }

  // handle email change request
  if (updates.email !== undefined) {
    const newEmail = updates.email ? String(updates.email).trim().toLowerCase() : null;
    if (newEmail && newEmail !== user.email) {
      // send OTP and save pendingEmail (handled by sendProfileOtp)
      await sendProfileOtp(userId, newEmail);
      // Do not set payload.email directly; sendProfileOtp saves pendingEmail on user
      return {
        message: "Pending email set. Verify the email with OTP.",
        pending: true,
        pendingType: "email",
        pendingIdentifier: newEmail,
        user: user.toJSON(),
      };
    }
  }

  // handle phone change request
  if (updates.phoneNumber !== undefined) {
    const raw = updates.phoneNumber ? String(updates.phoneNumber).trim() : null;
    const newPhone = raw ? normalizePhone(raw) : null;
    if (newPhone && newPhone !== user.phoneNumber) {
      await sendProfileOtp(userId, newPhone);
      return {
        message: "Pending phone set. Verify the phone with OTP.",
        pending: true,
        pendingType: "phone",
        pendingIdentifier: newPhone,
        user: user.toJSON(),
      };
    }
  }

  return { message: "Profile updated", user: user.toJSON() };
};

export const createUserProfileImageUpload = async (
  userId,
  { filename, contentType, size } = {},
  tenant = null,
) => {
  if (!filename || !contentType) {
    throw new Error("Profile image filename and content type are required");
  }

  if (!PROFILE_IMAGE_TYPES.has(String(contentType).toLowerCase())) {
    throw new Error("Use a JPG, PNG, or WebP profile image");
  }

  if (Number(size || 0) > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("Profile image must be 5 MB or smaller");
  }

  const extensionByType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return getPresignForImage(
    "user",
    String(userId),
    `profile.${extensionByType[String(contentType).toLowerCase()]}`,
    contentType,
    String(userId),
    tenant,
  );
};

export const saveUserProfileImage = async (
  userId,
  { key } = {},
  tenant = null,
) => {
  const expectedPrefix = `users/${String(userId)}/avatar/`;
  if (!key || !String(key).startsWith(expectedPrefix)) {
    throw new Error("Invalid profile image key");
  }

  const [user, aws] = await Promise.all([
    User.findById(userId),
    resolveAwsConfig(tenant),
  ]);

  if (!user) throw new Error("User not found");

  const previousKey = user.profileImage?.s3Key || "";
  const url = publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key,
  });

  user.profileImage = {
    url,
    s3Key: key,
    uploadedAt: new Date(),
  };
  await user.save();

  if (previousKey && previousKey !== key) {
    deleteFromStorage({ tenant, key: previousKey }).catch((error) => {
      console.error("Previous profile image cleanup failed:", error.message);
    });
  }

  return user.toJSON();
};

export const deleteUserProfileImage = async (userId, tenant = null) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const previousKey = user.profileImage?.s3Key || "";
  user.profileImage = {
    url: "",
    s3Key: "",
    uploadedAt: null,
  };
  await user.save();

  if (previousKey) {
    deleteFromStorage({ tenant, key: previousKey }).catch((error) => {
      console.error("Profile image cleanup failed:", error.message);
    });
  }

  return user.toJSON();
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
