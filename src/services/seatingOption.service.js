import SeatingOption from "../models/admin_models/SeatingOption.js";
import Space from "../models/admin_models/Space.js";
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
} from "../utils/mediaPolicy.js";

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
  const option = await SeatingOption.findById(optionId).select("_id images space");
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }
  return option;
};

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
  assertStorageKeyBelongsToPrefix(key, expectedPrefix, "seating option image");

  const head = await headStorageObject({ tenant, key }).catch(() => null);
  if (!head) {
    throw new Error("Uploaded file not found in storage");
  }

  const contentType = String(head.ContentType || "").toLowerCase().trim();
  const contentLength = Number(head.ContentLength || 0);

  if (!IMAGE_ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error("Unsupported stored file type for seating option image");
  }

  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error("Uploaded file size is invalid");
  }

  if (contentLength > IMAGE_MAX_BYTES) {
    throw new Error("Uploaded file exceeds seating option image size limit");
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

const hydrateSeatingOptions = async (optionOrOptions, tenant = null) => {
  const aws = await resolveAwsConfig(tenant);
  const isArrayInput = Array.isArray(optionOrOptions);
  const options = isArrayInput ? optionOrOptions : [optionOrOptions].filter(Boolean);

  const hydrated = options.map((option) => {
    const target =
      typeof option?.toObject === "function" ? option.toObject() : { ...option };

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
  return hydrateSeatingOptions(seatingOption, tenant);
}

export async function getSeatingOptionsBySpace(spaceId, opts = {}, tenant = null) {
  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;
  if (opts.type) query.type = opts.type;

  const q = SeatingOption.find(query).populate("space", "name slug");
  if (opts.select) q.select(opts.select);
  q.sort(opts.sort || { displayOrder: 1, createdAt: -1 });
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  const options = await q.exec();
  return hydrateSeatingOptions(options, tenant);
}

export async function getSeatingOptionById(optionId, tenant = null) {
  const option = await SeatingOption.findById(optionId).populate(
    "space",
    "name slug",
  );

  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  return hydrateSeatingOptions(option, tenant);
}

export async function updateSeatingOption(optionId, updates, tenant = null) {
  const option = await SeatingOption.findById(optionId);
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  Object.assign(option, updates, { updatedAt: new Date() });
  normalizeOrderedImages(option.images);
  await option.validate();
  await option.save();
  return hydrateSeatingOptions(option, tenant);
}

export async function deleteSeatingOption(optionId, tenant = null) {
  const option = await SeatingOption.findById(optionId);
  if (!option) {
    const err = new Error("Seating option not found");
    err.status = 404;
    throw err;
  }

  for (const key of (option.images || []).map((img) => img?.s3Key).filter(Boolean)) {
    await deleteFromStorage({ tenant, key });
  }

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

  const prefix = getEntityMediaPrefix("seating_option", optionId);
  const uploaded = await verifyStoredObject({
    tenant,
    key: imageData.key,
    expectedPrefix: prefix,
    expectedSize: imageData.size,
  });

  if ((option.images || []).some((image) => image?.s3Key === imageData.key)) {
    throw new Error("This image file is already attached");
  }

  const aws = await resolveAwsConfig(tenant);
  option.images.push({
    url: getImageUrl(aws, imageData.key),
    s3Key: imageData.key,
    mimeType: uploaded.contentType,
    altText: String(imageData.altText || "").trim(),
    caption: String(imageData.caption || "").trim(),
    order: (option.images || []).length + 1,
    size: uploaded.contentLength,
    width: imageData.width ?? null,
    height: imageData.height ?? null,
    isPrimary: (option.images || []).length === 0,
  });

  normalizeOrderedImages(option.images);

  if (userId) option.updatedBy = userId;
  await saveWithCompensation({
    doc: option,
    tenant,
    uploadedKey: imageData.key,
  });

  const saved = option.images.find((image) => image.s3Key === imageData.key);
  return {
    ...saved.toObject(),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
};

export async function updateSeatingOptionImageMetadata(
  optionId,
  imageId,
  updates,
  tenant = null,
) {
  const option = await ensureSeatingOptionExists(optionId);
  const image = option.images.id(imageId);

  if (!image) {
    const err = new Error("Image not found");
    err.status = 404;
    throw err;
  }

  Object.assign(image, sanitizeImageMetadata(updates));

  if (updates?.isPrimary) {
    setPrimaryImage(option.images, imageId);
  } else {
    normalizeOrderedImages(option.images);
  }

  await option.save();
  const aws = await resolveAwsConfig(tenant);
  const saved = option.images.id(imageId);
  return {
    ...saved.toObject(),
    url: getImageUrl(aws, saved.s3Key, saved.url),
  };
}

export async function reorderSeatingOptionImages(optionId, items, tenant = null) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error("Reorder items are required");
    err.status = 400;
    throw err;
  }

  const option = await ensureSeatingOptionExists(optionId);
  const currentIds = new Set((option.images || []).map((image) => String(image._id)));
  const providedIds = new Set(items.map((item) => String(item?.imageId || "")));

  if (currentIds.size !== providedIds.size) {
    const err = new Error("Reorder request must include every image exactly once");
    err.status = 400;
    throw err;
  }

  for (const image of option.images || []) {
    const nextOrder = items.find(
      (item) => String(item?.imageId || "") === String(image._id),
    )?.order;
    if (Number.isFinite(Number(nextOrder)) && Number(nextOrder) > 0) {
      image.order = Number(nextOrder);
    }
  }

  normalizeOrderedImages(option.images);
  await option.save();
  return hydrateImageArray(option.images, tenant);
}

export async function setPrimarySeatingOptionImage(optionId, imageId, tenant = null) {
  const option = await ensureSeatingOptionExists(optionId);
  setPrimaryImage(option.images, imageId);
  await option.save();
  return hydrateImageArray(option.images, tenant);
}

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
    await deleteFromStorage({ tenant, key: image.s3Key });
  }

  image.deleteOne();
  normalizeOrderedImages(option.images);
  await option.save();

  return { imageId };
}
