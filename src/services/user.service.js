// services/user.service.js
import User from "../models/user_models/User.js";
import { normalizePhone } from "../utils/phoneUtils.js";
import { normalizeUsername } from "../utils/usernameUtils.js";
import { getPresignForImage } from "./spaceMedia.service.js";
import {
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";
import {
  logSecurityEvent,
  SECURITY_EVENT_TYPES,
} from "./securityEvent.service.js";
import { sendProfileOtp } from "./profile.service.js";

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

const ensurePrimaryIdentifierAvailable = async ({
  userId,
  email,
  phoneNumber,
}) => {
  if (email) {
    const existing = await User.findOne({
      _id: { $ne: userId },
      $or: [{ email }, { pendingEmail: email }],
    }).lean();

    if (existing) {
      throw new Error("Email already in use");
    }
  }

  if (phoneNumber) {
    const existing = await User.findOne({
      _id: { $ne: userId },
      $or: [{ phoneNumber }, { pendingPhone: phoneNumber }],
    }).lean();

    if (existing) {
      throw new Error("Phone number already in use");
    }
  }
};

export const updateUserProfile = async (userId, updates = {}) => {
  const needsPasswordForSensitiveAction = Boolean(
    updates.email !== undefined ||
      updates.phoneNumber !== undefined ||
      updates.recoveryEmail !== undefined ||
      updates.recoveryPhone !== undefined,
  );

  const user = await User.findById(userId).select(
    needsPasswordForSensitiveAction ? "+password" : "",
  );
  if (!user) throw new Error("User not found");

  if (needsPasswordForSensitiveAction && user.password) {
    const currentPassword = String(updates.currentPassword || "");
    if (!currentPassword) {
      throw new Error("Current password is required for contact changes");
    }

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }
  }

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
      await ensurePrimaryIdentifierAvailable({ userId, email: newEmail });
      user.pendingEmail = newEmail;
      user.pendingEmailRequestedAt = new Date();
      await user.save();
      return {
        message: "Pending email saved. Send OTP from the verification popup to continue.",
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
      await ensurePrimaryIdentifierAvailable({ userId, phoneNumber: newPhone });
      user.pendingPhone = newPhone;
      user.pendingPhoneRequestedAt = new Date();
      await user.save();
      return {
        message: "Pending phone saved. Send OTP from the verification popup to continue.",
        pending: true,
        pendingType: "phone",
        pendingIdentifier: newPhone,
        user: user.toJSON(),
      };
    }
  }

  if (updates.recoveryEmail !== undefined) {
    const nextRecoveryEmail = String(updates.recoveryEmail || "").trim().toLowerCase();
    if (!nextRecoveryEmail) {
      const hadRecoveryEmail = Boolean(user.recoveryEmail || user.pendingRecoveryEmail);
      user.recoveryEmail = "";
      user.recoveryEmailVerified = false;
      user.pendingRecoveryEmail = "";
      user.pendingRecoveryEmailRequestedAt = undefined;
      if (hadRecoveryEmail) {
        await logSecurityEvent({
          userId,
          actorId: userId,
          eventType: SECURITY_EVENT_TYPES.RECOVERY_CONTACT_REMOVED,
          metadata: { channel: "email" },
        });
      }
      await user.save();
    } else if (nextRecoveryEmail !== user.recoveryEmail) {
      await sendProfileOtp(userId, nextRecoveryEmail, { contactType: "recovery" });
      return {
        message: "Pending recovery email set. Verify the email with OTP.",
        pending: true,
        pendingType: "recovery_email",
        pendingIdentifier: nextRecoveryEmail,
        user: user.toJSON(),
      };
    }
  }

  if (updates.recoveryPhone !== undefined) {
    const rawRecoveryPhone = String(updates.recoveryPhone || "").trim();
    const nextRecoveryPhone = rawRecoveryPhone ? normalizePhone(rawRecoveryPhone) : "";
    if (!nextRecoveryPhone) {
      const hadRecoveryPhone = Boolean(user.recoveryPhone || user.pendingRecoveryPhone);
      user.recoveryPhone = "";
      user.recoveryPhoneVerified = false;
      user.pendingRecoveryPhone = "";
      user.pendingRecoveryPhoneRequestedAt = undefined;
      if (hadRecoveryPhone) {
        await logSecurityEvent({
          userId,
          actorId: userId,
          eventType: SECURITY_EVENT_TYPES.RECOVERY_CONTACT_REMOVED,
          metadata: { channel: "phone" },
        });
      }
      await user.save();
    } else if (nextRecoveryPhone !== user.recoveryPhone) {
      await sendProfileOtp(userId, nextRecoveryPhone, { contactType: "recovery" });
      return {
        message: "Pending recovery phone set. Verify the phone with OTP.",
        pending: true,
        pendingType: "recovery_phone",
        pendingIdentifier: nextRecoveryPhone,
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
    size,
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
  if (String(newPassword).length < 8) {
    throw new Error("New password must be at least 8 characters");
  }

  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User not found");

  const match = await user.comparePassword(currentPassword);
  if (!match) throw new Error("Current password is incorrect");

  user.password = newPassword;
  user.securityPreferences = {
    ...(user.securityPreferences || {}),
    lastSecurityReviewAt: new Date(),
  };
  user.trustedDevices = [];
  await user.save();

  await logSecurityEvent({
    userId,
    actorId: userId,
    eventType: SECURITY_EVENT_TYPES.PASSWORD_CHANGED,
  });

  return { message: "Password changed successfully" };
};
