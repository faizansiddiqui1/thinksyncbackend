import Addon from "../models/admin_models/AddonSchema.js";
import {
  deleteFromStorage,
  headStorageObject,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";
import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_BYTES,
  assertStorageKeyBelongsToPrefix,
  getEntityMediaPrefix,
  normalizeOrderedImages,
  sanitizeImageMetadata,
  setPrimaryImage,
  validateAddonPricePayload,
} from "../utils/mediaPolicy.js";
import {
  ensureSpaceAccess,
  assertPlainAdminShortTermLeasingSpace,
  getOwnedSpaceIds,
  getActorUserId,
  isSuperAdminUser,
} from "./spaceAccess.service.js";

const getImageUrl = (aws, key, fallbackUrl = "") =>
  key
    ? publicUrlForKey({
        bucketName: aws.bucketName,
        region: aws.region,
        key,
      })
    : fallbackUrl || "";

const getImageClientId = (image = {}) =>
  String(image?._id || image?.id || image?.s3Key || image?.url || "").trim();

const findAddonImage = (images = [], identifier) => {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return null;

  return (Array.isArray(images) ? images : []).find((image) => {
    const imageId = String(image?._id || "").trim();
    const clientId = getImageClientId(image);
    const s3Key = String(image?.s3Key || "").trim();
    const url = String(image?.url || "").trim();

    return (
      imageId === normalizedIdentifier ||
      clientId === normalizedIdentifier ||
      s3Key === normalizedIdentifier ||
      url === normalizedIdentifier
    );
  }) || null;
};

const verifyStoredObject = async ({
  tenant,
  key,
  expectedPrefix,
  expectedSize,
}) => {
  assertStorageKeyBelongsToPrefix(key, expectedPrefix, "addon image");

  const head = await headStorageObject({ tenant, key }).catch(() => null);
  if (!head) {
    throw new Error("Uploaded file not found in storage");
  }

  const contentType = String(head.ContentType || "").toLowerCase().trim();
  const contentLength = Number(head.ContentLength || 0);

  if (!IMAGE_ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error("Unsupported stored file type for addon image");
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error("Uploaded file size is invalid");
  }

  if (contentLength > IMAGE_MAX_BYTES) {
    throw new Error("Uploaded file exceeds addon image size limit");
  }

  if (
    Number.isFinite(Number(expectedSize)) &&
    Number(expectedSize) > 0 &&
    Number(expectedSize) !== contentLength
  ) {
    throw new Error("Uploaded file size does not match the saved metadata");
  }

  return {
    contentType,
    contentLength,
  };
};

const hydrateAddons = async (addonOrAddons, tenant = null) => {
  const aws = await resolveAwsConfig(tenant);
  const isArrayInput = Array.isArray(addonOrAddons);
  const addons = isArrayInput ? addonOrAddons : [addonOrAddons].filter(Boolean);

  const hydrated = addons.map((addon) => {
    const target =
      typeof addon?.toObject === "function" ? addon.toObject() : { ...addon };

    target.images = normalizeOrderedImages(target.images || []).map((image) => ({
      ...image,
      id: getImageClientId(image),
      url: getImageUrl(aws, image?.s3Key, image?.url),
    }));

    return target;
  });

  return isArrayInput ? hydrated : hydrated[0] || null;
};

const hydrateImageArray = async (images = [], tenant = null) => {
  const aws = await resolveAwsConfig(tenant);
  return normalizeOrderedImages(images || []).map((image) => {
    const next = typeof image?.toObject === "function" ? image.toObject() : { ...image };
    next.id = getImageClientId(next);
    next.url = getImageUrl(aws, next?.s3Key, next?.url);
    return next;
  });
};

const ensureAddonAccess = async (addonId, user) => {
  const addon = await Addon.findById(addonId);
  if (!addon) {
    const err = new Error("Addon not found");
    err.status = 404;
    throw err;
  }

  await ensureSpaceAccess(addon.space, user);
  return addon;
};

const saveWithCompensation = async ({ doc, tenant, uploadedKey }) => {
  try {
    await doc.save();
  } catch (error) {
    if (uploadedKey) {
      await deleteFromStorage({ tenant, key: uploadedKey }).catch(() => null);
    }
    throw error;
  }
};

export async function createAddonForSpace(
  spaceId,
  data,
  user = null,
  tenant = null,
) {
  const space = await ensureSpaceAccess(spaceId, user);
  assertPlainAdminShortTermLeasingSpace(space, user, "Add-ons");
  validateAddonPricePayload(data);

  const payload = {
    ...data,
    space: spaceId,
  };

  if (payload.type === "shop" && payload.stock === undefined) {
    payload.stock = 0;
  }

  const addon = await Addon.create(payload);
  return hydrateAddons(addon, tenant);
}

export async function getAllAddons(filters = {}, user = null, tenant = null) {
  const query = {};

  if (filters.space) {
    await ensureSpaceAccess(filters.space, user);
    query.space = filters.space;
  }
  if (filters.type) query.type = filters.type;
  if (filters.category) query.category = filters.category;
  if (filters.isActive !== undefined && filters.isActive !== null) {
    query.isActive = filters.isActive === true || filters.isActive === "true";
  }

  if (!isSuperAdminUser(user) && !filters.space) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds?.length) {
      return [];
    }

    query.space = { $in: spaceIds };
  }

  const q = Addon.find(query)
    .populate("space", "name slug owner status isPublished")
    .sort({ displayOrder: 1, createdAt: -1 });

  if (filters.limit) q.limit(parseInt(filters.limit, 10));
  if (filters.skip) q.skip(parseInt(filters.skip, 10));
  if (filters.select) q.select(filters.select);

  const addons = await q.exec();
  return hydrateAddons(addons, tenant);
}

export async function getAddonsBySpace(spaceId, opts = {}, user = null, tenant = null) {
  await ensureSpaceAccess(spaceId, user);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;
  if (opts.type) query.type = opts.type;
  if (opts.category) query.category = opts.category;

  const q = Addon.find(query).populate("space", "name slug");

  if (opts.select) q.select(opts.select);
  q.sort(opts.sort || { displayOrder: 1, createdAt: -1 });
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  const addons = await q.exec();
  return hydrateAddons(addons, tenant);
}

export async function getAddonById(addonId, user = null, tenant = null) {
  const addon = await Addon.findById(addonId).populate(
    "space",
    "name slug owner status isPublished",
  );
  if (!addon) {
    const err = new Error("Addon not found");
    err.status = 404;
    throw err;
  }

  if (!isSuperAdminUser(user)) {
    await ensureSpaceAccess(addon.space?._id || addon.space, user);
  }

  return hydrateAddons(addon, tenant);
}

export async function updateAddon(addonId, updates, user = null, tenant = null) {
  const addon = await ensureAddonAccess(addonId, user);
  validateAddonPricePayload({ ...addon.toObject(), ...updates });

  Object.assign(addon, updates, { updatedAt: new Date() });
  normalizeOrderedImages(addon.images);

  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.validate();
  await addon.save();
  return hydrateAddons(addon, tenant);
}

export async function deleteAddon(addonId, user = null, tenant = null) {
  const addon = await ensureAddonAccess(addonId, user);

  for (const key of (addon.images || []).map((img) => img?.s3Key).filter(Boolean)) {
    await deleteFromStorage({ tenant, key });
  }

  await Addon.deleteOne({ _id: addonId });
  return addon;
}

export const addAddonImage = async (
  addonId,
  imageData,
  user = null,
  tenant = null,
) => {
  const addon = await ensureAddonAccess(addonId, user);

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  const prefix = getEntityMediaPrefix("addon", addonId);
  const uploaded = await verifyStoredObject({
    tenant,
    key: imageData.key,
    expectedPrefix: prefix,
    expectedSize: imageData.size,
  });

  if ((addon.images || []).some((image) => image?.s3Key === imageData.key)) {
    throw new Error("This image file is already attached");
  }

  const aws = await resolveAwsConfig(tenant);
  addon.images.push({
    url: getImageUrl(aws, imageData.key),
    s3Key: imageData.key,
    mimeType: uploaded.contentType,
    altText: String(imageData.altText || "").trim(),
    caption: String(imageData.caption || "").trim(),
    order: (addon.images || []).length + 1,
    size: uploaded.contentLength,
    width: imageData.width ?? null,
    height: imageData.height ?? null,
    isPrimary: (addon.images || []).length === 0,
  });

  normalizeOrderedImages(addon.images);

  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await saveWithCompensation({
    doc: addon,
    tenant,
    uploadedKey: imageData.key,
  });

  const saved = addon.images.find((image) => image.s3Key === imageData.key);
  return {
    ...saved.toObject(),
    id: getImageClientId(saved),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
};

export async function updateAddonImageMetadata(
  addonId,
  imageId,
  updates,
  user = null,
  tenant = null,
) {
  const addon = await ensureAddonAccess(addonId, user);
  const image = findAddonImage(addon.images, imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  const resolvedImageId = String(image?._id || "");

  Object.assign(image, sanitizeImageMetadata(updates));

  if (updates?.isPrimary) {
    setPrimaryImage(addon.images, resolvedImageId);
  } else {
    normalizeOrderedImages(addon.images);
  }

  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.save();

  const aws = await resolveAwsConfig(tenant);
  const saved = findAddonImage(addon.images, resolvedImageId);
  return {
    ...saved.toObject(),
    id: getImageClientId(saved),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
}

export async function reorderAddonImages(addonId, items, user = null, tenant = null) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("Reorder items are required");
    err.status = 400;
    throw err;
  }

  const addon = await ensureAddonAccess(addonId, user);
  const currentIds = new Set((addon.images || []).map((image) => String(image._id)));
  const providedIds = new Set(items.map((item) => String(item?.imageId || "")));

  if (currentIds.size !== providedIds.size) {
    const err = new Error("Reorder request must include every image exactly once");
    err.status = 400;
    throw err;
  }

  for (const image of addon.images || []) {
    const nextOrder = items.find(
      (item) => String(item?.imageId || "") === String(image._id),
    )?.order;
    if (Number.isFinite(Number(nextOrder)) && Number(nextOrder) > 0) {
      image.order = Number(nextOrder);
    }
  }

  normalizeOrderedImages(addon.images);

  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.save();
  return hydrateImageArray(addon.images, tenant);
}

export async function setPrimaryAddonImage(
  addonId,
  imageId,
  user = null,
  tenant = null,
) {
  const addon = await ensureAddonAccess(addonId, user);
  const image = findAddonImage(addon.images, imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  setPrimaryImage(addon.images, String(image?._id || ""));

  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.save();
  return hydrateImageArray(addon.images, tenant);
}

export async function deleteAddonImage(
  addonId,
  imageId,
  user = null,
  tenant = null,
) {
  if (!addonId || !imageId) {
    const err = new Error("addonId and imageId are required");
    err.status = 400;
    throw err;
  }

  const addon = await ensureAddonAccess(addonId, user);

  const image = findAddonImage(addon.images, imageId);
  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  const resolvedImageId = String(image?._id || imageId);

  if (image.s3Key) {
    await deleteFromStorage({ tenant, key: image.s3Key });
  }

  image.deleteOne();
  normalizeOrderedImages(addon.images);
  await addon.save();

  return { imageId: resolvedImageId };
}
