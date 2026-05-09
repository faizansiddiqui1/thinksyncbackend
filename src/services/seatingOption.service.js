import mime from "mime-types";
import SeatingOption from "../models/admin_models/SeatingOption.js";
import Space from "../models/admin_models/Space.js";
import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";

const ensureSpaceExists = async (spaceId) => {
  const space = await Space.findById(spaceId).select("_id");
  if (!space) {
    const err = new Error("Space not found");
    err.status = 404;
    throw err;
  }
  return space;
};

const ensureSeatingOptionExists = async (optionId) => {
  const option = await SeatingOption.findById(optionId).select(
    "_id images space",
  );
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }
  return option;
};

const getImageUrl = ({ bucketName, region, key }) =>
  publicUrlForKey({ bucketName, region, key });

export async function createSeatingOptionForSpace(
  spaceId,
  data,
  tenant = null,
) {
  await ensureSpaceExists(spaceId);

  const payload = {
    ...data,
    space: spaceId,
  };

  const seatingOption = await SeatingOption.create(payload);
  return seatingOption;
}

export async function getSeatingOptionsBySpace(spaceId, opts = {}) {
  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;
  if (opts.type) query.type = opts.type;

  const q = SeatingOption.find(query).populate("space", "name slug");
  if (opts.select) q.select(opts.select);
  if (opts.sort) q.sort(opts.sort);
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  return q.exec();
}

export async function getSeatingOptionById(optionId) {
  const option = await SeatingOption.findById(optionId).populate(
    "space",
    "name slug",
  );

  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  return option;
}

export async function updateSeatingOption(optionId, updates, tenant = null) {
  const option = await SeatingOption.findById(optionId);
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  Object.assign(option, updates, { updatedAt: new Date() });
  await option.validate();
  await option.save();
  return option;
}

export async function deleteSeatingOption(optionId, tenant = null) {
  const option = await SeatingOption.findById(optionId);
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  const imageKeys = (option.images || [])
    .map((img) => img?.s3Key)
    .filter(Boolean);

  await Promise.allSettled(
    imageKeys.map((key) => deleteFromStorage({ tenant, key })),
  );

  await SeatingOption.deleteOne({ _id: optionId });
  return option;
}

export const addSeatingOptionImage = async (
  optionId,
  imageData,
  userId = null,
  tenant = null,
) => {
  const option = await ensureSeatingOptionExists(optionId);

  if (!imageData?.key) {
    throw new Error("Image key is required");
  }

  const aws = await resolveAwsConfig(tenant);
  const url = getImageUrl({
    bucketName: aws.bucketName,
    region: aws.region,
    key: imageData.key,
  });

  const maxOrder = (option.images || []).reduce(
    (max, img) => Math.max(max, img.order || 0),
    0,
  );

  const imageToSave = {
    url,
    s3Key: imageData.key,
    altText: imageData.altText || "",
    caption: imageData.caption || "",
    order: maxOrder + 1,
    size: imageData.size || 0,
  };

  option.images.push(imageToSave);

  if (userId) option.updatedBy = userId;
  await option.save();

  return imageToSave;
};

export async function deleteSeatingOptionImage(optionId, imageId, tenant = null) {
  if (!optionId || !imageId) {
    const err = new Error("optionId and imageId are required");
    err.status = 400;
    throw err;
  }

  const option = await ensureSeatingOptionExists(optionId);
  const image = option.images.id(imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  if (image.s3Key) {
    try {
      await deleteFromStorage({ tenant, key: image.s3Key });
    } catch (s3Err) {
      console.error("S3 delete failed:", s3Err);
    }
  }

  image.deleteOne();
  await option.save();

  return { imageId };
}

export const getPresignForImage = async (
  optionId,
  filename,
  contentType,
  userId = null,
  tenant = null,
) => {
  if (!filename || !contentType) {
    throw new Error("filename and contentType are required");
  }

  await ensureSeatingOptionExists(optionId);

  let ext = "";
  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "jpg");
  }

  const random = Math.random().toString(36).slice(2, 8);
  const key = `seating-options/${optionId}/images/${Date.now()}_${random}${ext}`;

  const { uploadUrl, expiresIn, bucketName, region } =
    await createPresignedUpload({
      tenant,
      key,
      contentType,
      expiresSeconds: 900,
    });

  if (process.env.S3_PUBLIC === "true") {
    const url = publicUrlForKey({ bucketName, region, key });
    return { uploadUrl, key, url, expiresIn };
  }

  const previewUrl = await createSignedGetUrl({
    tenant,
    key,
    expiresSeconds: 900,
  }).catch(() => null);

  return { uploadUrl, key, previewUrl, expiresIn };
};