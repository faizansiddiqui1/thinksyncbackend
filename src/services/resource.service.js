// services/resourceService.js
import { createPresignedUpload } from "../config/s3.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import Space from "../models/admin_models/Space.js";

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});


export async function createResourceForSpace(spaceId, data) {
  // ensure space exists (simple guard)
  const space = await Space.findById(spaceId).select("_id");
  if (!space) {
    const err = new Error("Space not found");
    err.status = 404;
    throw err;
  }

  const payload = { ...data, space: spaceId };
  const resource = await Resource.create(payload);
  return resource;
}


export async function getAllResources() {
  return Resource.find({})
    .populate("space", "name slug")
    .sort({ createdAt: -1 })
    .exec();
}

export const addResourceImage = async (
  resourceId,
  imageData,
  userId = null
) => {
  const resource = await Resource.findById(resourceId);

  if (!resource) {
    throw new Error("Resource not found");
  }

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  const bucket = process.env.AWS_BUCKET_NAME;
  const region = process.env.AWS_REGION;

  // same url pattern as space images
  const url = `https://${bucket}.s3.${region}.amazonaws.com/${imageData.key}`;

  // calculate next order
  const maxOrder = resource.images.reduce(
    (max, img) => Math.max(max, img.order || 0),
    0
  );

  const imageToSave = {
    url,
    s3Key: imageData.key,
    altText: imageData.altText || "",
    caption: imageData.caption || "",
    order: maxOrder + 1,
    size: imageData.size || 0,
  };

  resource.images.push(imageToSave);

  if (userId) resource.updatedBy = userId;

  await resource.save();

  return imageToSave;
};


/**
 * Delete single image from resource
 */
export async function deleteResourceImage(resourceId, imageId) {
  if (!resourceId || !imageId) {
    const err = new Error("resourceId and imageId are required");
    err.status = 400;
    throw err;
  }

  const resource = await Resource.findById(resourceId);

  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }

  // find image inside images array
  const image = resource.images.id(imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  // 1️⃣ delete from S3 (if key exists)
  if (image.s3Key) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: image.s3Key,
        })
      );
    } catch (s3Err) {
      console.error("S3 delete failed:", s3Err);
      // don't block DB deletion if S3 fails
    }
  }

  // 2️⃣ remove from DB
  image.deleteOne(); // mongoose subdocument delete
  await resource.save();

  return { imageId };
}


export async function getResourcesBySpace(spaceId, opts = {}) {
  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;

  const q = Resource.find(query);
  if (opts.select) q.select(opts.select);
  if (opts.sort) q.sort(opts.sort);
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  return q.exec();
}

export async function getResourceById(resourceId) {
  const r = await Resource.findById(resourceId).populate("space", "name slug");
  if (!r) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }
  return r;
}

export async function updateResource(resourceId, updates) {
  const resource = await Resource.findById(resourceId);
  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }

  Object.assign(resource, updates, { updatedAt: new Date() });
  await resource.validate();
  await resource.save();
  return resource;
}

export async function deleteResource(resourceId) {
  const resource = await Resource.findByIdAndDelete(resourceId);
  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }
  return resource;
}

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
