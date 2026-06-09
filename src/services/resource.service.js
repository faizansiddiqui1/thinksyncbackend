import Resource from "../models/admin_models/ResourceSchema.js";
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
  validateResourcePricingPayload,
} from "../utils/mediaPolicy.js";
import {
  ensureSpaceAccess,
  assertPlainAdminShortTermLeasingSpace,
  getOwnedSpaceIds,
  isSuperAdminUser,
  getActorUserId,
} from "./spaceAccess.service.js";

const MAX_RESOURCE_IMAGES = 5;

const getImageUrl = (aws, key, fallbackUrl = "") =>
  key
    ? publicUrlForKey({
        bucketName: aws.bucketName,
        region: aws.region,
        key,
      })
    : fallbackUrl || "";

const verifyStoredObject = async ({
  tenant,
  key,
  expectedPrefix,
  expectedSize,
}) => {
  assertStorageKeyBelongsToPrefix(key, expectedPrefix, "resource image");

  const head = await headStorageObject({ tenant, key }).catch(() => null);
  if (!head) {
    throw new Error("Uploaded file not found in storage");
  }

  const contentType = String(head.ContentType || "").toLowerCase().trim();
  const contentLength = Number(head.ContentLength || 0);

  if (!IMAGE_ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error("Unsupported stored file type for resource image");
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error("Uploaded file size is invalid");
  }

  if (contentLength > IMAGE_MAX_BYTES) {
    throw new Error("Uploaded file exceeds resource image size limit");
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

const hydrateResourceImages = async (resourceOrResources, tenant = null) => {
  const aws = await resolveAwsConfig(tenant);
  const isArrayInput = Array.isArray(resourceOrResources);
  const resources = isArrayInput
    ? resourceOrResources
    : [resourceOrResources].filter(Boolean);

  const hydrated = resources.map((resource) => {
    const target =
      typeof resource?.toObject === "function" ? resource.toObject() : { ...resource };

    target.images = normalizeOrderedImages(target.images || []).map((image) => ({
      ...image,
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
    next.url = getImageUrl(aws, next?.s3Key, next?.url);
    return next;
  });
};

const ensureResourceAccess = async (resourceId, user) => {
  const resource = await Resource.findById(resourceId);
  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }

  await ensureSpaceAccess(resource.space, user);
  return resource;
};

const assertNoDuplicateKey = (images = [], key) => {
  if ((images || []).some((image) => image?.s3Key === key)) {
    const err = new Error("This image file is already attached");
    err.status = 400;
    throw err;
  }
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

export async function createResourceForSpace(
  spaceId,
  data,
  user = null,
  tenant = null,
) {
  const space = await ensureSpaceAccess(spaceId, user);
  assertPlainAdminShortTermLeasingSpace(space, user, "Resources");
  validateResourcePricingPayload(data);

  const payload = { ...data, space: spaceId };
  const resource = await Resource.create(payload);
  return hydrateResourceImages(resource, tenant);
}

export async function getAllResources(user, tenant = null) {
  const query = {};

  if (!isSuperAdminUser(user)) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds.length) {
      return [];
    }

    query.space = { $in: spaceIds };
  }

  const resources = await Resource.find(query)
    .populate("space", "name slug owner address status isPublished")
    .sort({ displayOrder: 1, createdAt: -1 })
    .lean()
    .exec();

  return hydrateResourceImages(resources, tenant);
}

export const addResourceImage = async (
  resourceId,
  imageData,
  user = null,
  tenant = null,
) => {
  const resource = await ensureResourceAccess(resourceId, user);

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  if ((resource.images || []).length >= MAX_RESOURCE_IMAGES) {
    const err = new Error(`Maximum ${MAX_RESOURCE_IMAGES} images allowed per resource`);
    err.status = 400;
    throw err;
  }

  const prefix = getEntityMediaPrefix("resource", resourceId);
  const uploaded = await verifyStoredObject({
    tenant,
    key: imageData.key,
    expectedPrefix: prefix,
    expectedSize: imageData.size,
  });

  assertNoDuplicateKey(resource.images, imageData.key);

  const aws = await resolveAwsConfig(tenant);
  resource.images.push({
    url: getImageUrl(aws, imageData.key),
    s3Key: imageData.key,
    mimeType: uploaded.contentType,
    altText: String(imageData.altText || "").trim(),
    caption: String(imageData.caption || "").trim(),
    order: (resource.images || []).length + 1,
    size: uploaded.contentLength,
    width: imageData.width ?? null,
    height: imageData.height ?? null,
    isPrimary: (resource.images || []).length === 0,
  });

  normalizeOrderedImages(resource.images);

  if (getActorUserId(user)) resource.updatedBy = getActorUserId(user);
  await saveWithCompensation({
    doc: resource,
    tenant,
    uploadedKey: imageData.key,
  });

  const saved = resource.images.find((image) => image.s3Key === imageData.key);
  return {
    ...saved.toObject(),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
};

export async function updateResourceImageMetadata(
  resourceId,
  imageId,
  updates,
  user = null,
  tenant = null,
) {
  const resource = await ensureResourceAccess(resourceId, user);
  const image = resource.images.id(imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  Object.assign(image, sanitizeImageMetadata(updates));

  if (updates?.isPrimary) {
    setPrimaryImage(resource.images, imageId);
  } else {
    normalizeOrderedImages(resource.images);
  }

  if (getActorUserId(user)) resource.updatedBy = getActorUserId(user);
  await resource.save();

  const aws = await resolveAwsConfig(tenant);
  const saved = resource.images.id(imageId);
  return {
    ...saved.toObject(),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
}

export async function reorderResourceImages(
  resourceId,
  items,
  user = null,
  tenant = null,
) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("Reorder items are required");
    err.status = 400;
    throw err;
  }

  const resource = await ensureResourceAccess(resourceId, user);
  const currentIds = new Set((resource.images || []).map((image) => String(image._id)));
  const providedIds = new Set(items.map((item) => String(item?.imageId || "")));

  if (currentIds.size !== providedIds.size) {
    const err = new Error("Reorder request must include every image exactly once");
    err.status = 400;
    throw err;
  }

  for (const image of resource.images || []) {
    const nextOrder = items.find(
      (item) => String(item?.imageId || "") === String(image._id),
    )?.order;
    if (Number.isFinite(Number(nextOrder)) && Number(nextOrder) > 0) {
      image.order = Number(nextOrder);
    }
  }

  normalizeOrderedImages(resource.images);

  if (getActorUserId(user)) resource.updatedBy = getActorUserId(user);
  await resource.save();
  return hydrateImageArray(resource.images, tenant);
}

export async function setPrimaryResourceImage(
  resourceId,
  imageId,
  user = null,
  tenant = null,
) {
  const resource = await ensureResourceAccess(resourceId, user);
  setPrimaryImage(resource.images, imageId);

  if (getActorUserId(user)) resource.updatedBy = getActorUserId(user);
  await resource.save();
  return hydrateImageArray(resource.images, tenant);
}

export async function deleteResourceImage(
  resourceId,
  imageId,
  user = null,
  tenant = null,
) {
  if (!resourceId || !imageId) {
    const err = new Error("resourceId and imageId are required");
    err.status = 400;
    throw err;
  }

  const resource = await ensureResourceAccess(resourceId, user);
  const image = resource.images.id(imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  if ((resource.images || []).length <= 1) {
    const err = new Error("At least 1 image is required for every resource");
    err.status = 400;
    throw err;
  }

  if (image.s3Key) {
    await deleteFromStorage({ tenant, key: image.s3Key });
  }

  image.deleteOne();
  normalizeOrderedImages(resource.images);
  await resource.save();

  return { imageId };
}

export async function getResourcesBySpace(
  spaceId,
  opts = {},
  user = null,
  tenant = null,
) {
  await ensureSpaceAccess(spaceId, user);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;

  const q = Resource.find(query).populate("space", "name slug").lean();
  if (opts.select) q.select(opts.select);
  q.sort(opts.sort || { displayOrder: 1, createdAt: -1 });
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  const resources = await q.exec();
  return hydrateResourceImages(resources, tenant);
}

export async function getResourceById(resourceId, user = null, tenant = null) {
  const resource = await Resource.findById(resourceId)
    .populate("space", "name slug owner address status isPublished")
    .lean();

  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }

  if (!isSuperAdminUser(user)) {
    await ensureSpaceAccess(resource.space?._id || resource.space, user);
  }

  return hydrateResourceImages(resource, tenant);
}

export async function updateResource(
  resourceId,
  updates,
  user = null,
  tenant = null,
) {
  const resource = await ensureResourceAccess(resourceId, user);
  const merged = {
    ...resource.toObject(),
    ...updates,
    bookingRules: {
      ...(resource.bookingRules?.toObject?.() || resource.bookingRules || {}),
      ...(updates.bookingRules || {}),
    },
    prices: {
      ...(resource.prices?.toObject?.() || resource.prices || {}),
      ...(updates.prices || {}),
    },
  };

  validateResourcePricingPayload(merged);

  Object.assign(resource, updates, { updatedAt: new Date() });
  normalizeOrderedImages(resource.images);

  if (getActorUserId(user)) {
    resource.updatedBy = getActorUserId(user);
  }

  await resource.validate();
  await resource.save();
  return hydrateResourceImages(resource, tenant);
}

export async function deleteResource(resourceId, user = null, tenant = null) {
  const resource = await ensureResourceAccess(resourceId, user);

  for (const key of (resource.images || []).map((image) => image?.s3Key).filter(Boolean)) {
    await deleteFromStorage({ tenant, key });
  }

  await Resource.deleteOne({ _id: resourceId });
  return resource;
}
