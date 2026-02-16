// services/spaceMedia.service.js
import Space from "../models/admin_models/Space.js";
import SpaceMedia from "../models/admin_models/SpaceMedia.js";
import mongoose from "mongoose";
import {
  createPresignedUpload,
  createSignedGetUrl,
  publicUrlForKey,
} from "../config/s3.js";
import mime from "mime-types";

const ensureSpaceExists = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId))
    throw new Error("Invalid space id");
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

/* ========== PRESIGN ========== */

export const getPresignForImage = async (
  spaceId,
  filename,
  contentType,
  userId = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!filename || !contentType)
    throw new Error("filename and contentType are required");

  // derive extension if missing
  let ext = "";
  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "jpg");
  }

  const random = Math.random().toString(36).slice(2, 8);
  const key = `spaces/${spaceId}/${Date.now()}_${random}${ext}`;

  const { uploadUrl, expiresIn } = await createPresignedUpload({
    key,
    contentType,
    expiresSeconds: 900,
  });

  if (process.env.S3_PUBLIC === "true") {
    const url = publicUrlForKey({ key });
    return { uploadUrl, key, url, expiresIn };
  } else {
    // Private bucket -> return signed GET for immediate preview if desired
    const previewUrl = await createSignedGetUrl({
      key,
      expiresSeconds: 900,
    }).catch(() => null);
    return { uploadUrl, key, previewUrl, expiresIn };
  }
};

/* IMAGES */
export const addImage = async (spaceId, imageData, userId = null) => {
  await ensureSpaceExists(spaceId);

  // ensure either url or key present
  if (!imageData || (!imageData.url && !imageData.key)) {
    throw new Error("Image url or key is required");
  }

  const media = await getOrCreateMedia(spaceId, userId);

  // ALWAYS auto-generate order (ignore user input)
  const maxOrder = media.images.reduce(
    (max, img) => Math.max(max, img.order || 0),
    0,
  );

  const resolvedUrl = imageData.url
    ? imageData.url
    : process.env.S3_PUBLIC === "true"
      ? publicUrlForKey({ key: imageData.key })
      : undefined;

  const imageToSave = {
    url: resolvedUrl,
    s3Key: imageData.key || undefined,
    altText: imageData.altText || "",
    caption: imageData.caption || "",
    order: maxOrder + 1,
    size: imageData.size,
  };

  media.images.push(imageToSave);

  if (userId) media.updatedBy = userId;
  await media.save();

  return media.images[media.images.length - 1];
};

export const updateImage = async (
  spaceId,
  imageId,
  updateData,
  userId = null,
) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media) throw new Error("Media not found");

  const image = media.images.id(imageId);
  if (!image) throw new Error("Image not found");

  // allow updates to altText, caption, order, size, or url
  Object.assign(image, updateData);
  if (userId) media.updatedBy = userId;
  await media.save();
  return image;
};

export const deleteImage = async (spaceId, imageId, userId = null) => {
  await ensureSpaceExists(spaceId);

  const result = await SpaceMedia.updateOne(
    { space: spaceId, "images._id": imageId },
    {
      $pull: { images: { _id: imageId } },
      ...(userId && { $set: { updatedBy: userId } }),
    },
  );

  if (result.modifiedCount === 0) {
    throw new Error("Image not found");
  }

  return true;
};

/* VIDEO (single) */

export const getPresignForVideo = async (
  spaceId,
  filename,
  contentType,
  userId = null,
) => {
  await ensureSpaceExists(spaceId);

  if (!contentType.startsWith("video/")) {
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

  const { uploadUrl, expiresIn } = await createPresignedUpload({
    key,
    contentType,
    expiresSeconds: 900,
  });

  if (process.env.S3_PUBLIC === "true") {
    const url = publicUrlForKey({ key });
    return { uploadUrl, key, url, expiresIn };
  } else {
    const previewUrl = await createSignedGetUrl({
      key,
      expiresSeconds: 900,
    }).catch(() => null);
    return { uploadUrl, key, previewUrl, expiresIn };
  }
};

export const addVideo = async (spaceId, videoData, userId = null) => {
  await ensureSpaceExists(spaceId);

  if (!videoData || (!videoData.url && !videoData.key)) {
    throw new Error("Video url or key is required");
  }

  // validate duration if provided
  if (videoData.duration != null) {
    const d = Number(videoData.duration);
    if (Number.isNaN(d) || d < 15 || d > 120) {
      throw new Error("Video duration must be between 15 and 120 seconds");
    }
  }

  let media = await SpaceMedia.findOne({ space: spaceId });
  if (media && media.video && (media.video.url || media.video.s3Key)) {
    throw new Error("Video already exists. Use update instead.");
  }

  if (!media) media = new SpaceMedia({ space: spaceId, createdBy: userId });

  const resolvedUrl = videoData.url
    ? videoData.url
    : process.env.S3_PUBLIC === "true"
      ? publicUrlForKey({ key: videoData.key })
      : undefined;

  media.video = {
    url: resolvedUrl,
    s3Key: videoData.key || undefined,
    provider: videoData.provider || "custom",
    thumbnail: videoData.thumbnail || undefined,
    duration: videoData.duration ? Number(videoData.duration) : undefined,
    caption: videoData.caption || undefined,
  };

  if (userId) media.updatedBy = userId;
  await media.save();
  return media.video;
};

export const updateVideo = async (spaceId, videoData, userId = null) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media || !media.video)
    throw new Error("Video not found. Use add instead.");

  Object.assign(media.video, videoData);
  if (userId) media.updatedBy = userId;
  await media.save();
  return media.video;
};

export const deleteVideo = async (spaceId, userId = null) => {
  await ensureSpaceExists(spaceId);

  const media = await SpaceMedia.findOne({ space: spaceId });
  if (!media || !media.video) throw new Error("Video not found");

  media.video = undefined;
  if (userId) media.updatedBy = userId;
  await media.save();
  return true;
};

/* optional helper: get media for a space */
export const getMediaBySpace = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId))
    throw new Error("Invalid space id");
  return await SpaceMedia.findOne({ space: spaceId }).lean().exec();
};
