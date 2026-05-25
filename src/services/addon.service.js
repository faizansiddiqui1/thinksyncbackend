import mime from "mime-types";
import Addon from "../models/admin_models/AddonSchema.js";
import Space from "../models/admin_models/Space.js";
import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
  publicUrlForKey,
  resolveAwsConfig,
} from "../config/s3.js";
import {
  ensureSpaceAccess,
  getOwnedSpaceIds,
  getActorUserId,
  isSuperAdminUser,
} from "./spaceAccess.service.js";

const ensureSpaceExists = async (spaceId) => {
  const space = await Space.findById(spaceId).select("_id");
  if (!space) {
    const err = new Error("Space not found");
    err.status = 404;
    throw err;
  }
  return space;
};

const ensureAddonExists = async (addonId) => {
  const addon = await Addon.findById(addonId).select("_id images space");
  if (!addon) {
    const err = new Error("Addon not found");
    err.status = 404;
    throw err;
  }
  return addon;
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

const getImageUrl = ({ bucketName, region, key }) =>
  publicUrlForKey({ bucketName, region, key });

export async function createAddonForSpace(
  spaceId,
  data,
  user = null,
  tenant = null,
) {
  await ensureSpaceAccess(spaceId, user);

  const payload = {
    ...data,
    space: spaceId,
  };

  if (payload.type === "shop" && payload.stock === undefined) {
    payload.stock = 0;
  }

  const addon = await Addon.create(payload);
  return addon;
}

export async function getAllAddons(filters = {}, user = null) {
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
    .sort({ createdAt: -1 });

  if (filters.limit) q.limit(parseInt(filters.limit, 10));
  if (filters.skip) q.skip(parseInt(filters.skip, 10));
  if (filters.select) q.select(filters.select);

  return q.exec();
}

export async function getAddonsBySpace(spaceId, opts = {}, user = null) {
  await ensureSpaceAccess(spaceId, user);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;
  if (opts.type) query.type = opts.type;
  if (opts.category) query.category = opts.category;

  const q = Addon.find(query).populate("space", "name slug");

  if (opts.select) q.select(opts.select);
  if (opts.sort) q.sort(opts.sort);
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  return q.exec();
}

export async function getAddonById(addonId, user = null) {
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

  return addon;
}

export async function updateAddon(addonId, updates, user = null, tenant = null) {
  const addon = await ensureAddonAccess(addonId, user);

  Object.assign(addon, updates, { updatedAt: new Date() });
  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.validate();
  await addon.save();
  return addon;
}

export async function deleteAddon(addonId, user = null, tenant = null) {
  const addon = await ensureAddonAccess(addonId, user);

  const imageKeys = (addon.images || [])
    .map((img) => img?.s3Key)
    .filter(Boolean);

  await Promise.allSettled(
    imageKeys.map((key) => deleteFromStorage({ tenant, key })),
  );

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

  const aws = await resolveAwsConfig(tenant);

  const url = getImageUrl({
    bucketName: aws.bucketName,
    region: aws.region,
    key: imageData.key,
  });

  const maxOrder = (addon.images || []).reduce(
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

  addon.images.push(imageToSave);
  if (getActorUserId(user)) {
    addon.updatedBy = getActorUserId(user);
  }
  await addon.save();

  return imageToSave;
};

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

  const image = addon.images.id(imageId);
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
  await addon.save();

  return { imageId };
}

/**
 * Optional helper if your existing presign route calls service directly.
 * No new route is needed.
 */
export const getPresignForImage = async (
  addonId,
  filename,
  contentType,
  userId = null,
  tenant = null,
) => {
  if (!filename || !contentType) {
    throw new Error("filename and contentType are required");
  }

  await ensureAddonExists(addonId);

  let ext = "";
  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "jpg");
  }

  const random = Math.random().toString(36).slice(2, 8);
  const key = `addons/${addonId}/images/${Date.now()}_${random}${ext}`;

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
