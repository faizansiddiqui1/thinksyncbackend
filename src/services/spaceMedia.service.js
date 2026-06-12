import mongoose from "mongoose";
import Space from "../models/admin_models/Space.js";
import SpaceMedia from "../models/admin_models/SpaceMedia.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import SeatingOption from "../models/admin_models/SeatingOption.js";
import Addon from "../models/admin_models/AddonSchema.js";
import City from "../models/super_admin_models/City.model.js";
import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
  headStorageObject,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";
import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_BYTES,
  MEDIA_CACHE_CONTROL,
  VIDEO_ALLOWED_MIME_TYPES,
  VIDEO_MAX_BYTES,
  assertStorageKeyBelongsToPrefix,
  buildEntityMediaKey,
  buildSpaceVideoKey,
  ensureUploadIsAllowed,
  getEntityMediaPrefix,
  getSpaceVideoPrefix,
  normalizeOrderedImages,
  sanitizeImageMetadata,
  setPrimaryImage,
} from "../utils/mediaPolicy.js";

const ensureObjectId = (value, label) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${label} id`);
  }
};

const ensureSpaceExists = async (spaceId) => {
  ensureObjectId(spaceId, "space");
  const space = await Space.findById(spaceId).select("_id");
  if (!space) throw new Error("Space not found");
  return space;
};

const ensureResourceExists = async (resourceId) => {
  ensureObjectId(resourceId, "resource");
  const resource = await Resource.findById(resourceId).select("_id");
  if (!resource) throw new Error("Resource not found");
  return resource;
};

const ensureCityExists = async (cityId) => {
  ensureObjectId(cityId, "city");
  const city = await City.findById(cityId).select("_id");
  if (!city) throw new Error("City not found");
  return city;
};

const ensureAddonExists = async (addonId) => {
  ensureObjectId(addonId, "addon");
  const addon = await Addon.findById(addonId).select("_id");
  if (!addon) throw new Error("Addon not found");
  return addon;
};

const ensureSeatingOptionExists = async (optionId) => {
  ensureObjectId(optionId, "seating option");
  const option = await SeatingOption.findById(optionId).select("_id");
  if (!option) throw new Error("Seating option not found");
  return option;
};

const getPublicAssetUrl = (aws, key, fallbackUrl = "") => {
  if (!key) return fallbackUrl || "";

  return publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key,
  });
};

const normalizeImageOutput = (image, aws) => {
  if (!image) return image;

  const next = typeof image.toObject === "function" ? image.toObject() : { ...image };
  next.url = getPublicAssetUrl(aws, next.s3Key, next.url);
  return next;
};

const normalizeVideoOutput = (video, aws) => {
  if (!video) return null;

  const next = typeof video.toObject === "function" ? video.toObject() : { ...video };
  next.url = getPublicAssetUrl(aws, next.s3Key, next.url);
  return next;
};

const verifyStoredObject = async ({
  tenant,
  key,
  expectedPrefix,
  allowedMimeTypes,
  maxBytes,
  expectedSize,
  entityLabel,
}) => {
  assertStorageKeyBelongsToPrefix(key, expectedPrefix, entityLabel);

  const head = await headStorageObject({ tenant, key }).catch(() => null);

  if (!head) {
    throw new Error("Uploaded file not found in storage");
  }

  const contentType = String(head.ContentType || "").toLowerCase().trim();
  const contentLength = Number(head.ContentLength || 0);

  if (!allowedMimeTypes.includes(contentType)) {
    throw new Error(`Unsupported stored file type for ${entityLabel}`);
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error("Uploaded file size is invalid");
  }

  if (contentLength > maxBytes) {
    throw new Error(`Uploaded file exceeds ${entityLabel} size limit`);
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

const ensureNoDuplicateKey = (items = [], key, entityLabel = "media") => {
  if ((items || []).some((item) => item?.s3Key === key)) {
    throw new Error(`This ${entityLabel} file is already attached`);
  }
};

const rehydrateMedia = (media, aws) => {
  if (!media) return null;

  const next = typeof media.toObject === "function" ? media.toObject() : { ...media };
  next.images = normalizeOrderedImages(next.images || []).map((image) =>
    normalizeImageOutput(image, aws),
  );
  next.video = normalizeVideoOutput(next.video, aws);
  return next;
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

const sortReorderedImages = (images = [], items = []) => {
  const orderMap = new Map(
    (Array.isArray(items) ? items : []).map((item) => [
      String(item?.imageId || ""),
      Number(item?.order || 0),
    ]),
  );

  (images || []).forEach((image) => {
    const nextOrder = orderMap.get(String(image?._id || ""));
    if (Number.isFinite(nextOrder) && nextOrder > 0) {
      image.order = nextOrder;
    }
  });

  return normalizeOrderedImages(images);
};

export const getOrCreateMedia = async (spaceId, userId = null) => {
  let media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) {
    media = new SpaceMedia({ space: spaceId, createdBy: userId });
    await media.save();
  }
  return media;
};

export const getPresignForImage = async (
  entity,
  entityId,
  filename,
  contentType,
  size,
  userId = null,
  tenant = null,
) => {
  ensureUploadIsAllowed({ entity, entityId, filename, contentType, size });

  if (entity === "space" || entity === "space_document") {
    await ensureSpaceExists(entityId);
  } else if (entity === "resource") {
    await ensureResourceExists(entityId);
  } else if (entity === "addon") {
    await ensureAddonExists(entityId);
  } else if (entity === "seating_option") {
    await ensureSeatingOptionExists(entityId);
  } else if (entity === "city_document") {
    await ensureCityExists(entityId);
  } else if (entity === "user" && !userId) {
    throw new Error("Authentication required");
  } else if (entity === "consultant" && !userId) {
    throw new Error("Authentication required");
  }

  const key = buildEntityMediaKey({
    entity,
    entityId,
    filename,
    contentType,
  });

  const aws = await resolveAwsConfig(tenant);
  const { uploadUrl, expiresIn } = await createPresignedUpload({
    tenant,
    key,
    contentType,
    expiresSeconds: 900,
    cacheControl: MEDIA_CACHE_CONTROL,
  });

  if (process.env.S3_PUBLIC === "true") {
    return {
      uploadUrl,
      key,
      url: getPublicAssetUrl(aws, key),
      expiresIn,
    };
  }

  const previewUrl = await createSignedGetUrl({
    tenant,
    key,
    expiresSeconds: 900,
  }).catch(() => null);

  return { uploadUrl, key, previewUrl, expiresIn };
};

export const addImage = async (
  spaceId,
  imageData,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  const prefix = getEntityMediaPrefix("space", spaceId);
  const uploaded = await verifyStoredObject({
    tenant,
    key: imageData.key,
    expectedPrefix: prefix,
    allowedMimeTypes: IMAGE_ALLOWED_MIME_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
    expectedSize: imageData.size,
    entityLabel: "space image",
  });

  const aws = await resolveAwsConfig(tenant);
  const media = await getOrCreateMedia(spaceId, userId);
  ensureNoDuplicateKey(media.images, imageData.key, "image");

  const imageToSave = {
    url: getPublicAssetUrl(aws, imageData.key),
    s3Key: imageData.key,
    mimeType: uploaded.contentType,
    altText: String(imageData.altText || "").trim(),
    caption: String(imageData.caption || "").trim(),
    order: (media.images || []).length + 1,
    size: uploaded.contentLength,
    width: imageData.width ?? null,
    height: imageData.height ?? null,
    isPrimary: (media.images || []).length === 0,
  };

  media.images.push(imageToSave);
  normalizeOrderedImages(media.images);

  if (userId) media.updatedBy = userId;
  await saveWithCompensation({
    doc: media,
    tenant,
    uploadedKey: imageData.key,
  });

  const saved = media.images.find((image) => image.s3Key === imageData.key);
  return normalizeImageOutput(saved, aws);
};

export const updateImage = async (
  spaceId,
  imageId,
  updateData,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) throw new Error("Media not found");

  const image = media.images.id(imageId);
  if (!image) throw new Error("Image not found");

  const updates = sanitizeImageMetadata(updateData);
  Object.assign(image, updates);

  if (updates.isPrimary) {
    setPrimaryImage(media.images, imageId);
  } else {
    normalizeOrderedImages(media.images);
  }

  if (userId) media.updatedBy = userId;
  await media.save();

  const aws = await resolveAwsConfig(tenant);
  return normalizeImageOutput(media.images.id(imageId), aws);
};

export const reorderImages = async (
  spaceId,
  items,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!Array.isArray(items) || !items.length) {
    throw new Error("Reorder items are required");
  }

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) throw new Error("Media not found");

  const currentIds = new Set((media.images || []).map((image) => String(image._id)));
  const providedIds = new Set(items.map((item) => String(item?.imageId || "")));

  if (currentIds.size !== providedIds.size) {
    throw new Error("Reorder request must include every image exactly once");
  }

  for (const id of currentIds) {
    if (!providedIds.has(id)) {
      throw new Error("Reorder request must include every image exactly once");
    }
  }

  sortReorderedImages(media.images, items);

  if (userId) media.updatedBy = userId;
  await media.save();

  const aws = await resolveAwsConfig(tenant);
  return media.images.map((image) => normalizeImageOutput(image, aws));
};

export const setPrimarySpaceImage = async (
  spaceId,
  imageId,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) throw new Error("Media not found");

  setPrimaryImage(media.images, imageId);

  if (userId) media.updatedBy = userId;
  await media.save();

  const aws = await resolveAwsConfig(tenant);
  return media.images.map((image) => normalizeImageOutput(image, aws));
};

export const deleteImage = async (
  spaceId,
  imageId,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) throw new Error("Media not found");

  const image = media.images.id(imageId);
  if (!image) throw new Error("Image not found");

  if (image.s3Key) {
    await deleteFromStorage({ tenant, key: image.s3Key });
  }

  image.deleteOne();
  normalizeOrderedImages(media.images);

  if (userId) media.updatedBy = userId;
  await media.save();
  return true;
};

export const getPresignForVideo = async (
  spaceId,
  filename,
  contentType,
  size,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  const key = buildSpaceVideoKey({
    spaceId,
    filename,
    contentType,
    size,
  });

  const aws = await resolveAwsConfig(tenant);
  const { uploadUrl, expiresIn } = await createPresignedUpload({
    tenant,
    key,
    contentType,
    expiresSeconds: 900,
    cacheControl: MEDIA_CACHE_CONTROL,
  });

  if (process.env.S3_PUBLIC === "true") {
    return {
      uploadUrl,
      key,
      url: getPublicAssetUrl(aws, key),
      expiresIn,
    };
  }

  const previewUrl = await createSignedGetUrl({
    tenant,
    key,
    expiresSeconds: 900,
  }).catch(() => null);

  return { uploadUrl, key, previewUrl, expiresIn };
};

export const addVideo = async (
  spaceId,
  videoData,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!videoData?.key) {
    throw new Error("Video key is required");
  }

  const prefix = getSpaceVideoPrefix(spaceId);
  const uploaded = await verifyStoredObject({
    tenant,
    key: videoData.key,
    expectedPrefix: prefix,
    allowedMimeTypes: VIDEO_ALLOWED_MIME_TYPES,
    maxBytes: VIDEO_MAX_BYTES,
    expectedSize: videoData.size,
    entityLabel: "space video",
  });

  const aws = await resolveAwsConfig(tenant);
  let media = await SpaceMedia.findOne({ space: spaceId });

  if (media?.video?.s3Key) {
    throw new Error("Video already exists. Use delete before uploading a new one.");
  }

  if (!media) media = new SpaceMedia({ space: spaceId, createdBy: userId });

  media.video = {
    s3Key: videoData.key,
    url: getPublicAssetUrl(aws, videoData.key),
    mimeType: "video/mp4",
    provider: "custom",
    duration: videoData.duration ? Number(videoData.duration) : undefined,
    caption: videoData.caption ? String(videoData.caption).trim() : undefined,
    size: uploaded.contentLength,
    width: videoData.width ?? null,
    height: videoData.height ?? null,
    thumbnail: videoData.thumbnail || "",
  };

  if (userId) media.updatedBy = userId;
  await saveWithCompensation({
    doc: media,
    tenant,
    uploadedKey: videoData.key,
  });

  return normalizeVideoOutput(media.video, aws);
};

export const updateVideo = async (
  spaceId,
  videoData,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media || !media.video) {
    throw new Error("Video not found. Use add instead.");
  }

  if (videoData.caption !== undefined) {
    media.video.caption = String(videoData.caption || "").trim();
  }

  if (videoData.duration !== undefined) {
    media.video.duration = Number(videoData.duration);
  }

  if (userId) media.updatedBy = userId;
  await media.save();

  const aws = await resolveAwsConfig(tenant);
  return normalizeVideoOutput(media.video, aws);
};

export const deleteVideo = async (spaceId, userId = null, tenant = null) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media || !media.video) throw new Error("Video not found");

  if (media.video.s3Key) {
    await deleteFromStorage({ tenant, key: media.video.s3Key });
  }

  media.video = null;

  if (userId) media.updatedBy = userId;
  await media.save();

  return true;
};

export const getMediaBySpace = async (spaceId, tenant = null) => {
  ensureObjectId(spaceId, "space");

  const media = await SpaceMedia.findOne({ space: spaceId })
    .select("images video")
    .lean()
    .exec();

  if (!media) return null;

  const aws = await resolveAwsConfig(tenant);
  return rehydrateMedia(media, aws);
};
