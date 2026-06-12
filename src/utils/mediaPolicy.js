import path from "path";
import mime from "mime-types";

export const IMAGE_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const IMAGE_ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
export const VIDEO_ALLOWED_MIME_TYPES = ["video/mp4"];
export const VIDEO_ALLOWED_EXTENSIONS = [".mp4"];
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const DOCUMENT_ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ENTITY_UPLOAD_CONFIG = {
  space: {
    prefix: (entityId) => `spaces/${entityId}/images`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  resource: {
    prefix: (entityId) => `resources/${entityId}/images`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  addon: {
    prefix: (entityId) => `addons/${entityId}/images`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  seating_option: {
    prefix: (entityId) => `seating-options/${entityId}/images`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  consultant: {
    prefix: (entityId) => `consultants/${entityId || "new"}/profile`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  user: {
    prefix: (entityId) => `users/${entityId}/avatar`,
    mimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    extensions: IMAGE_ALLOWED_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  city_document: {
    prefix: (entityId) => `documents/cities/${entityId}`,
    mimeTypes: DOCUMENT_ALLOWED_MIME_TYPES,
    extensions: DOCUMENT_ALLOWED_EXTENSIONS,
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  space_document: {
    prefix: (entityId) => `documents/spaces/${entityId}`,
    mimeTypes: DOCUMENT_ALLOWED_MIME_TYPES,
    extensions: DOCUMENT_ALLOWED_EXTENSIONS,
    maxBytes: DOCUMENT_MAX_BYTES,
  },
};

const IMAGE_MUTABLE_FIELDS = new Set(["altText", "caption", "order", "isPrimary"]);

function getUploadConfig(entity) {
  const config = ENTITY_UPLOAD_CONFIG[entity];

  if (!config) {
    throw new Error("Invalid upload entity");
  }

  return config;
}

function normalizeExtension(filename = "", contentType = "") {
  const fileExt = path.extname(String(filename || "")).toLowerCase();
  if (fileExt) return fileExt;

  const mimeExt = mime.extension(contentType);
  return mimeExt ? `.${String(mimeExt).toLowerCase()}` : "";
}

export function ensureUploadIsAllowed({
  entity,
  filename,
  contentType,
  size,
}) {
  const config = getUploadConfig(entity);
  const normalizedContentType = String(contentType || "").toLowerCase().trim();
  const normalizedExtension = normalizeExtension(filename, normalizedContentType);

  if (!filename || !normalizedContentType) {
    throw new Error("filename and contentType are required");
  }

  if (!config.mimeTypes.includes(normalizedContentType)) {
    throw new Error(`Unsupported file type for ${entity}`);
  }

  if (!config.extensions.includes(normalizedExtension)) {
    throw new Error(`Unsupported file extension for ${entity}`);
  }

  if (!Number.isFinite(Number(size)) || Number(size) <= 0) {
    throw new Error("File size must be provided");
  }

  if (Number(size) > config.maxBytes) {
    throw new Error(`File exceeds size limit for ${entity}`);
  }

  return {
    ...config,
    contentType: normalizedContentType,
    extension: normalizedExtension,
    size: Number(size),
  };
}

export function getEntityMediaPrefix(entity, entityId) {
  return getUploadConfig(entity).prefix(entityId);
}

export function getSpaceVideoPrefix(spaceId) {
  return `spaces/${spaceId}/video`;
}

export function buildEntityMediaKey({
  entity,
  entityId,
  filename,
  contentType,
}) {
  const config = getUploadConfig(entity);
  const normalizedContentType = String(contentType || "").toLowerCase().trim();
  const extension = normalizeExtension(filename, normalizedContentType);

  if (!config.mimeTypes.includes(normalizedContentType)) {
    throw new Error(`Unsupported file type for ${entity}`);
  }

  if (!config.extensions.includes(extension)) {
    throw new Error(`Unsupported file extension for ${entity}`);
  }

  const prefix = getEntityMediaPrefix(entity, entityId);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${Date.now()}_${random}${extension}`;
}

export function buildSpaceVideoKey({ spaceId, filename, contentType, size }) {
  const normalizedContentType = String(contentType || "").toLowerCase().trim();
  const extension = normalizeExtension(filename, normalizedContentType);

  if (!VIDEO_ALLOWED_MIME_TYPES.includes(normalizedContentType)) {
    throw new Error("Only MP4 videos are supported");
  }

  if (!VIDEO_ALLOWED_EXTENSIONS.includes(extension)) {
    throw new Error("Video must use .mp4 extension");
  }

  if (!Number.isFinite(Number(size)) || Number(size) <= 0) {
    throw new Error("Video size must be provided");
  }

  if (Number(size) > VIDEO_MAX_BYTES) {
    throw new Error("Video exceeds size limit");
  }

  const random = Math.random().toString(36).slice(2, 8);
  return `${getSpaceVideoPrefix(spaceId)}/${Date.now()}_${random}${extension}`;
}

export function assertStorageKeyBelongsToPrefix(key, prefix, entityLabel = "media") {
  const normalizedKey = String(key || "").trim();
  const normalizedPrefix = String(prefix || "").trim().replace(/\/+$/, "");

  if (!normalizedKey) {
    throw new Error("Storage key is required");
  }

  if (!normalizedKey.startsWith(`${normalizedPrefix}/`)) {
    throw new Error(`Invalid storage key for ${entityLabel}`);
  }

  return normalizedKey;
}

export function sanitizeImageMetadata(input = {}) {
  const next = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (!IMAGE_MUTABLE_FIELDS.has(key)) continue;
    next[key] = value;
  }

  if (next.altText !== undefined) {
    next.altText = String(next.altText || "").trim();
  }

  if (next.caption !== undefined) {
    next.caption = String(next.caption || "").trim();
  }

  if (next.order !== undefined) {
    next.order = Number(next.order);
  }

  if (next.isPrimary !== undefined) {
    next.isPrimary = Boolean(next.isPrimary);
  }

  return next;
}

export function normalizeOrderedImages(images = []) {
  const sorted = [...(Array.isArray(images) ? images : [])].sort((a, b) => {
    const orderA = Number(a?.order ?? Number.MAX_SAFE_INTEGER);
    const orderB = Number(b?.order ?? Number.MAX_SAFE_INTEGER);

    if (orderA !== orderB) return orderA - orderB;

    return String(a?._id || a?.s3Key || "").localeCompare(
      String(b?._id || b?.s3Key || ""),
    );
  });

  let primaryAssigned = false;

  sorted.forEach((image, index) => {
    image.order = index + 1;

    if (!primaryAssigned && image?.isPrimary) {
      image.isPrimary = true;
      primaryAssigned = true;
      return;
    }

    image.isPrimary = false;
  });

  if (sorted[0] && !primaryAssigned) {
    sorted[0].isPrimary = true;
  }

  return sorted;
}

export function setPrimaryImage(images = [], imageId) {
  const normalizedId = String(imageId || "");
  let found = false;

  (Array.isArray(images) ? images : []).forEach((image) => {
    const isTarget = String(image?._id || "") === normalizedId;
    image.isPrimary = isTarget;
    if (isTarget) found = true;
  });

  if (!found) {
    throw new Error("Image not found");
  }

  return normalizeOrderedImages(images);
}

export function validateResourcePricingPayload(payload = {}) {
  const rules = payload?.bookingRules || {};
  const prices = payload?.prices || {};
  const priceTypes = [
    ["supportsHourly", "hourly", "Hourly"],
    ["supportsDaily", "daily", "Daily"],
    ["supportsWeekly", "weekly", "Weekly"],
    ["supportsMonthly", "monthly", "Monthly"],
  ];

  const enabled = priceTypes.filter(([flag]) => Boolean(rules?.[flag]));

  if (!enabled.length) {
    throw new Error("At least one pricing type must be enabled");
  }

  for (const [flag, priceKey, label] of priceTypes) {
    const enabledFlag = Boolean(rules?.[flag]);
    const rawValue = prices?.[priceKey];

    if (!enabledFlag) {
      if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue) && numericValue > 0) {
          throw new Error(`${label} price must be empty when ${label.toLowerCase()} pricing is disabled`);
        }
      }
      continue;
    }

    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      throw new Error(`${label} price is required`);
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      throw new Error(`${label} price must be a valid number`);
    }

    if (numericValue <= 100) {
      throw new Error(`${label} price must be greater than 100`);
    }
  }
}

export function validateAddonPricePayload(payload = {}) {
  const rawValue = payload?.price;

  if (rawValue === "" || rawValue === null || rawValue === undefined) {
    throw new Error("Addon price is required");
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue)) {
    throw new Error("Addon price must be a valid number");
  }

  if (numericValue <= 10) {
    throw new Error("Addon price must be greater than 10");
  }
}
