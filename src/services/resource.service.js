// services/resourceService.js
import Resource from "../models/admin_models/ResourceSchema.js";
import Space from "../models/admin_models/Space.js";

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
