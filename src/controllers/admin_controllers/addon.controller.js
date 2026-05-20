import * as service from "../../services/addon.service.js";

function getContext(req) {
  return req.context || {};
}

function getTenant(req) {
  return getContext(req).tenant || req.tenant || null;
}

/**
 * POST /space/:spaceId/addons
 */
export async function createAddon(req, res, next) {
  try {
    const { spaceId } = req.params;
    const payload = req.body;
    const tenant = getTenant(req);

    const addon = await service.createAddonForSpace(spaceId, payload, tenant);

    return res.status(201).json({
      success: true,
      data: addon,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /addons
 * Admin - all addons
 */
export async function getAllAddons(req, res, next) {
  try {
    const filters = {
      space: req.query.space,
      type: req.query.type,
      category: req.query.category,
      isActive: req.query.isActive,
      limit: req.query.limit,
      skip: req.query.skip,
      select: req.query.select,
    };

    const addons = await service.getAllAddons(filters);

    return res.status(200).json({
      success: true,
      count: addons.length,
      data: addons,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /space/:spaceId/addons
 */
export async function listAddonsBySpace(req, res, next) {
  try {
    const { spaceId } = req.params;

    const opts = {
      activeOnly: req.query.active === "true",
      type: req.query.type,
      category: req.query.category,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
      sort: req.query.sort || "-createdAt",
    };

    const addons = await service.getAddonsBySpace(spaceId, opts);

    return res.status(200).json({
      success: true,
      count: addons.length,
      data: addons,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /addons/:addonId
 */
export async function getAddon(req, res, next) {
  try {
    const { addonId } = req.params;
    const addon = await service.getAddonById(addonId);

    return res.status(200).json({
      success: true,
      data: addon,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /addons/:addonId
 */
export async function updateAddon(req, res, next) {
  try {
    const { addonId } = req.params;
    const updates = req.body;
    const tenant = getTenant(req);

    const addon = await service.updateAddon(addonId, updates, tenant);

    return res.status(200).json({
      success: true,
      data: addon,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /addons/:addonId
 */
export async function removeAddon(req, res, next) {
  try {
    const { addonId } = req.params;
    const tenant = getTenant(req);

    const addon = await service.deleteAddon(addonId, tenant);

    return res.status(200).json({
      success: true,
      data: addon,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /space/:spaceId/addons/:addonId/images
 * Body must contain already-uploaded S3 key from your existing presign flow:
 * { key, altText?, caption?, size? }
 */
export async function addAddonImage(req, res, next) {
  try {
    const tenant = getTenant(req);

    const img = await service.addAddonImage(
      req.params.addonId,
      req.body,
      req.user?.id,
      tenant,
    );

    return res.status(201).json({
      success: true,
      message: "Image added",
      data: img,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /addons/:addonId/images/:imageId
 */
export async function deleteAddonImage(req, res, next) {
  try {
    const { addonId, imageId } = req.params;
    const tenant = getTenant(req);

    const result = await service.deleteAddonImage(addonId, imageId, tenant);

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}