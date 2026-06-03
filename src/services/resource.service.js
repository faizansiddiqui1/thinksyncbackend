import mime from "mime-types";
import Resource from "../models/admin_models/ResourceSchema.js";
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
  assertPlainAdminShortTermLeasingSpace,
  getOwnedSpaceIds,
  isSuperAdminUser,
  getActorUserId,
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

const ensureResourceExists = async (resourceId) => {
  const resource =
    await Resource.findById(resourceId).select("_id images space");
  if (!resource) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }
  return resource;
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

const getImageUrl = ({ bucketName, region, key }) =>
  publicUrlForKey({ bucketName, region, key });

async function hydrateResourceImages(resourceOrResources, tenant = null) {
  const isArrayInput = Array.isArray(resourceOrResources);
  const resources = isArrayInput ? resourceOrResources : [resourceOrResources].filter(Boolean);

  const hydrated = await Promise.all(
    resources.map(async (resource) => {
      const target = typeof resource?.toObject === "function" ? resource.toObject() : { ...resource };

      if (!Array.isArray(target.images)) return target;

      return {
        ...target,
        images: await Promise.all(
          target.images.map(async (image) => {
            if (!image?.s3Key) return image;
            const previewUrl = await createSignedGetUrl({
              tenant,
              key: image.s3Key,
              expiresSeconds: 3600,
            }).catch(() => image.previewUrl || "");

            return {
              ...image,
              previewUrl: previewUrl || image.previewUrl || image.url || "",
            };
          }),
        ),
      };
    }),
  );

  return isArrayInput ? hydrated : hydrated[0] || null;
}

export async function createResourceForSpace(
  spaceId,
  data,
  user = null,
  tenant = null,
) {
  const space = await ensureSpaceAccess(spaceId, user);
  assertPlainAdminShortTermLeasingSpace(space, user, "Resources");

  const payload = { ...data, space: spaceId };
  const resource = await Resource.create(payload);
  return resource;
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
    .sort({ createdAt: -1 })
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

  if ((resource.images || []).length >= 5) {
    const err = new Error("Maximum 5 images allowed per resource");
    err.status = 400;
    throw err;
  }

  const aws = await resolveAwsConfig(tenant);
  const url = getImageUrl({
    bucketName: aws.bucketName,
    region: aws.region,
    key: imageData.key,
  });

  const maxOrder = (resource.images || []).reduce(
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

  resource.images.push(imageToSave);

  if (getActorUserId(user)) resource.updatedBy = getActorUserId(user);
  await resource.save();

  return imageToSave;
};

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
    try {
      await deleteFromStorage({ tenant, key: image.s3Key });
    } catch (s3Err) {
      console.error("S3 delete failed:", s3Err);
    }
  }

  image.deleteOne();
  await resource.save();

  return { imageId };
}

export async function getResourcesBySpace(spaceId, opts = {}, user = null, tenant = null) {
  await ensureSpaceAccess(spaceId, user);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;

  const q = Resource.find(query).populate("space", "name slug").lean();
  if (opts.select) q.select(opts.select);
  if (opts.sort) q.sort(opts.sort);
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  const resources = await q.exec();
  return hydrateResourceImages(resources, tenant);
}

export async function getResourceById(resourceId, user = null, tenant = null) {
  const r = await Resource.findById(resourceId).populate(
    "space",
    "name slug owner address status isPublished",
  ).lean();
  if (!r) {
    const err = new Error("Resource not found");
    err.status = 404;
    throw err;
  }

  if (!isSuperAdminUser(user)) {
    await ensureSpaceAccess(r.space?._id || r.space, user);
  }

  return hydrateResourceImages(r, tenant);
}

export async function updateResource(
  resourceId,
  updates,
  user = null,
  tenant = null,
) {
  const resource = await ensureResourceAccess(resourceId, user);

  Object.assign(resource, updates, { updatedAt: new Date() });
  if (getActorUserId(user)) {
    resource.updatedBy = getActorUserId(user);
  }
  await resource.validate();
  await resource.save();
  return resource;
}

export async function deleteResource(resourceId, user = null, tenant = null) {
  const resource = await ensureResourceAccess(resourceId, user);

  const imageKeys = (resource.images || [])
    .map((img) => img?.s3Key)
    .filter(Boolean);

  await Promise.allSettled(
    imageKeys.map((key) => deleteFromStorage({ tenant, key })),
  );

  await Resource.deleteOne({ _id: resourceId });

  return resource;
}

/**
 * Optional helper if you later add a presign route for resource images.
 * Upload path: resources/:resourceId/images/...
 */
export const getPresignForImage = async (
  resourceId,
  filename,
  contentType,
  userId = null,
  tenant = null,
) => {
  if (!filename || !contentType) {
    throw new Error("filename and contentType are required");
  }

  await ensureResourceExists(resourceId);

  let ext = "";
  if (filename.includes(".")) {
    ext = filename.substring(filename.lastIndexOf("."));
  } else {
    ext = "." + (mime.extension(contentType) || "jpg");
  }

  const random = Math.random().toString(36).slice(2, 8);
  const key = `resources/${resourceId}/images/${Date.now()}_${random}${ext}`;

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
