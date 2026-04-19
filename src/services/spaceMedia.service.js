import Space from "../models/admin_models/Space.js";
import SpaceMedia from "../models/admin_models/SpaceMedia.js";
import mongoose from "mongoose";
import mime from "mime-types";
import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";

const ensureSpaceExists = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId)) {
    throw new Error("Invalid space id");
  }

  const space = await Space.findById(spaceId).select("_id");
  if (!space) throw new Error("Space not found");
  return space;
};

export const getOrCreateMedia = async (spaceId, userId = null) => {
  let media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) {
    media = new SpaceMedia({ space: spaceId, createdBy: userId });
    await media.save();
  }
  return media;
};

/* ========== PRESIGN IMAGE ========== */
export const getPresignForImage = async (
  entity,
  entityId,
  filename,
  contentType,
  userId = null,
  tenant = null,
) => {
  if (!filename || !contentType) {
    throw new Error("filename and contentType are required");
  }

  const folderMap = {
    space: (id) => `spaces/${id}/images`,
    resource: (id) => `spaces/${id}/resources`,
    kyc: (id) => `kyc/${id}`,
    user: (id) => `users/${id}/avatar`,
  };

  if (!folderMap[entity]) {
    throw new Error("Invalid upload entity");
  }

  if (entity === "space" || entity === "resource") {
    await ensureSpaceExists(entityId);
  }

  if (entity === "kyc" && userId && String(entityId) !== String(userId)) {
    throw new Error("You can upload only your own KYC");
  }

  let ext = "";
  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "jpg");
  }

  const random = Math.random().toString(36).slice(2, 8);
  const key = `${folderMap[entity](entityId)}/${Date.now()}_${random}${ext}`;

  const aws = await resolveAwsConfig(tenant);

  const { uploadUrl, expiresIn } = await createPresignedUpload({
    tenant,
    key,
    contentType,
    expiresSeconds: 900,
  });

  if (process.env.S3_PUBLIC === "true") {
    const url = publicUrlForKey({
      bucketName: aws.bucketName,
      region: aws.region,
      key,
    });

    return { uploadUrl, key, url, expiresIn };
  }

  const previewUrl = await createSignedGetUrl({
    tenant,
    key,
    expiresSeconds: 900,
  }).catch(() => null);

  return { uploadUrl, key, previewUrl, expiresIn };
};

/* ========== IMAGES ========== */
export const addImage = async (spaceId, imageData, userId = null, tenant = null) => {
  await ensureSpaceExists(spaceId);

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  const aws = await resolveAwsConfig(tenant);
  const url = publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key: imageData.key,
  });

  const media = await getOrCreateMedia(spaceId, userId);

  const maxOrder = media.images.reduce(
    (max, img) => Math.max(max, img.order || 0),
    0,
  );

  const imageToSave = {
    url,
    s3Key: imageData.key,
    altText: imageData.altText || "",
    caption: imageData.caption || "",
    order: maxOrder + 1,
    size: imageData.size,
  };

  media.images.push(imageToSave);

  if (userId) media.updatedBy = userId;
  await media.save();

  return imageToSave;
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

  Object.assign(image, updateData);
  if (userId) media.updatedBy = userId;
  await media.save();
  return image;
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

  const img = media.images.find((i) => i._id.toString() === imageId.toString());
  if (!img) throw new Error("Image not found");

  if (img.s3Key) {
    await deleteFromStorage({ tenant, key: img.s3Key });
  }

  media.images = media.images.filter(
    (i) => i._id.toString() !== imageId.toString(),
  );

  media.images.forEach((img, i) => (img.order = i + 1));

  if (userId) media.updatedBy = userId;
  await media.save();

  return true;
};

/* ========== PRESIGN VIDEO ========== */
export const getPresignForVideo = async (
  spaceId,
  filename,
  contentType,
  userId = null,
  tenant = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!contentType?.startsWith("video/")) {
    throw new Error("Only video files allowed");
  }

  const random = Math.random().toString(36).slice(2, 8);
  let ext = "";

  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "mp4");
  }

  const key = `videos/${spaceId}/${Date.now()}_${random}${ext}`;

  const aws = await resolveAwsConfig(tenant);

  const { uploadUrl, expiresIn } = await createPresignedUpload({
    tenant,
    key,
    contentType,
    expiresSeconds: 900,
  });

  if (process.env.S3_PUBLIC === "true") {
    const url = publicUrlForKey({
      bucketName: aws.bucketName,
      region: aws.region,
      key,
    });

    return { uploadUrl, key, url, expiresIn };
  }

  const previewUrl = await createSignedGetUrl({
    tenant,
    key,
    expiresSeconds: 900,
  }).catch(() => null);

  return { uploadUrl, key, previewUrl, expiresIn };
};

export const addVideo = async (spaceId, videoData, userId = null, tenant = null) => {
  await ensureSpaceExists(spaceId);

  if (!videoData?.key) {
    throw new Error("Video key is required");
  }

  const aws = await resolveAwsConfig(tenant);
  const url = publicUrlForKey({
    bucketName: aws.bucketName,
    region: aws.region,
    key: videoData.key,
  });

  let media = await SpaceMedia.findOne({ space: spaceId });

  if (media?.video?.s3Key) {
    throw new Error("Video already exists. Use update instead.");
  }

  if (!media) media = new SpaceMedia({ space: spaceId, createdBy: userId });

  media.video = {
    s3Key: videoData.key,
    url,
    provider: videoData.provider || "custom",
    duration: videoData.duration ? Number(videoData.duration) : undefined,
    caption: videoData.caption || undefined,
  };

  if (userId) media.updatedBy = userId;
  await media.save();

  return media.video;
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

  Object.assign(media.video, videoData);
  if (userId) media.updatedBy = userId;
  await media.save();
  return media.video;
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

export const getMediaBySpace = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId)) {
    throw new Error("Invalid space id");
  }

  return await SpaceMedia.findOne({ space: spaceId })
    .select("images video")
    .lean()
    .exec();
};