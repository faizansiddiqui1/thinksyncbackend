import * as service from "../../services/seatingOption.service.js";

function getContext(req) {
  return req.context || {};
}

function getTenant(req) {
  return getContext(req).tenant || req.tenant || null;
}

/**
 * POST /space/:spaceId/seating-options
 */
export async function createSeatingOption(req, res, next) {
  try {
    const { spaceId } = req.params;
    const payload = req.body;
    const tenant = getTenant(req);

    const option = await service.createSeatingOptionForSpace(
      spaceId,
      payload,
      tenant,
    );

    return res.status(201).json({ success: true, data: option });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /space/:spaceId/seating-options
 */
export async function listSeatingOptionsBySpace(req, res, next) {
  try {
    const { spaceId } = req.params;

    const opts = {
      activeOnly: req.query.active === "true",
      type: req.query.type || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
      sort: req.query.sort || "-displayOrder -createdAt",
    };

    const options = await service.getSeatingOptionsBySpace(spaceId, opts, getTenant(req));

    return res.status(200).json({
      success: true,
      count: options.length,
      data: options,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /seating-options/:optionId
 */
export async function getSeatingOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const option = await service.getSeatingOptionById(optionId, getTenant(req));

    return res.status(200).json({ success: true, data: option });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /seating-options/:optionId
 */
export async function updateSeatingOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const updates = req.body;
    const tenant = getTenant(req);

    const option = await service.updateSeatingOption(optionId, updates, tenant);

    return res.status(200).json({ success: true, data: option });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /seating-options/:optionId
 */
export async function removeSeatingOption(req, res, next) {
  try {
    const { optionId } = req.params;
    const tenant = getTenant(req);

    const option = await service.deleteSeatingOption(optionId, tenant);

    return res.status(200).json({ success: true, data: option });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /space/:spaceId/seating-options/:optionId/images
 */
export async function addSeatingOptionImage(req, res, next) {
  try {
    const tenant = getTenant(req);

    const img = await service.addSeatingOptionImage(
      req.params.optionId,
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
 * DELETE /seating-options/:optionId/images/:imageId
 */
export async function deleteSeatingOptionImage(req, res, next) {
  try {
    const { optionId, imageId } = req.params;
    const tenant = getTenant(req);

    const result = await service.deleteSeatingOptionImage(
      optionId,
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

export async function updateSeatingOptionImageMetadata(req, res, next) {
  try {
    const tenant = getTenant(req);
    const image = await service.updateSeatingOptionImageMetadata(
      req.params.optionId,
      req.params.imageId,
      req.body,
      tenant,
    );

    return res.status(200).json({ success: true, data: image });
  } catch (err) {
    return next(err);
  }
}

export async function reorderSeatingOptionImages(req, res, next) {
  try {
    const tenant = getTenant(req);
    const images = await service.reorderSeatingOptionImages(
      req.params.optionId,
      req.body?.items,
      tenant,
    );

    return res.status(200).json({ success: true, data: images });
  } catch (err) {
    return next(err);
  }
}

export async function setPrimarySeatingOptionImage(req, res, next) {
  try {
    const tenant = getTenant(req);
    const images = await service.setPrimarySeatingOptionImage(
      req.params.optionId,
      req.params.imageId,
      tenant,
    );

    return res.status(200).json({ success: true, data: images });
  } catch (err) {
    return next(err);
  }
}
