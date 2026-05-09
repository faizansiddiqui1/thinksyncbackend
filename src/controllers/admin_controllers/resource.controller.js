import * as service from "../../services/resource.service.js";

function getContext(req) {
  return req.context || {};
}

function getTenant(req) {
  return getContext(req).tenant || req.tenant || null;
}

/**
 * POST /space/:spaceId/resources
 */
export async function createResource(req, res, next) {
  try {
    const { spaceId } = req.params;
    const payload = req.body;
    const tenant = getTenant(req);  

    const resource = await service.createResourceForSpace(
      spaceId,
      payload,
      tenant,
    );

    return res.status(201).json({ success: true, data: resource });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /resources
 * Return all resources (no filters)
 */
export async function getAllResources(req, res, next) {
  try {
    const userId = req.user.id; // 👈 logged in admin

    const resources = await service.getAllResources(userId);

    return res.status(200).json({
      success: true,
      count: resources.length,
      data: resources,
    });
  } catch (err) {
    return next(err);
  }
}

export const addResourceImage = async (req, res) => {
  try {
    const tenant = getTenant(req);

    const img = await service.addResourceImage(
      req.params.resourceId,
      req.body,
      req.user?.id,
      tenant,
    );

    return res.status(201).json({
      message: "Image added",
      data: img,
    });
  } catch (err) {
    return res.status(400).json({
      message: err.message,
    });
  }
};

/**
 * DELETE /resources/:resourceId/images/:imageId
 */
export async function deleteResourceImage(req, res, next) {
  try {
    const { resourceId, imageId } = req.params;
    const tenant = getTenant(req);

    const result = await service.deleteResourceImage(
      resourceId,
      imageId,
      tenant,
    );

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /space/:spaceId/resources
 */
export async function listResourcesBySpace(req, res, next) {
  try {
    const { spaceId } = req.params;
    const opts = {
      activeOnly: req.query.active === "true",
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
      sort: req.query.sort || "-createdAt",
    };

    const resources = await service.getResourcesBySpace(spaceId, opts);

    return res
      .status(200)
      .json({ success: true, count: resources.length, data: resources });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /resources/:resourceId
 */
export async function getResource(req, res, next) {
  try {
    const { resourceId } = req.params;
    const resource = await service.getResourceById(resourceId);

    return res.status(200).json({ success: true, data: resource });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /resources/:resourceId
 */
export async function updateResource(req, res, next) {
  try {
    const { resourceId } = req.params;
    const updates = req.body;
    const tenant = getTenant(req);

    const resource = await service.updateResource(resourceId, updates, tenant);

    return res.status(200).json({ success: true, data: resource });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /resources/:resourceId
 */
export async function removeResource(req, res, next) {
  try {
    const { resourceId } = req.params;
    const tenant = getTenant(req);

    const resource = await service.deleteResource(resourceId, tenant);

    return res.status(200).json({ success: true, data: resource });
  } catch (err) {
    return next(err);
  }
}
