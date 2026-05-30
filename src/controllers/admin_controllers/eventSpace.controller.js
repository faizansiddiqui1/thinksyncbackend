import * as service from "../../services/eventSpace.service.js";

export async function createEventSpace(req, res, next) {
  try {
    const { spaceId } = req.params;

    const eventSpace = await service.createEventSpaceForSpace(
      spaceId,
      req.body,
      req.user?.id || null,
    );

    return res.status(201).json({
      success: true,
      message: "Event space details saved successfully",
      data: eventSpace,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getEventSpaceBySpace(req, res, next) {
  try {
    const { spaceId } = req.params;

    const eventSpace = await service.getEventSpaceBySpace(spaceId, {
      activeOnly: req.query.active === "true",
    });

    return res.status(200).json({
      success: true,
      data: eventSpace,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getEventSpaceById(req, res, next) {
  try {
    const { eventSpaceId } = req.params;

    const eventSpace = await service.getEventSpaceById(eventSpaceId);

    return res.status(200).json({
      success: true,
      data: eventSpace,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateEventSpace(req, res, next) {
  try {
    const { eventSpaceId } = req.params;

    const eventSpace = await service.updateEventSpace(
      eventSpaceId,
      req.body,
      req.user?.id || null,
    );

    return res.status(200).json({
      success: true,
      message: "Event space details updated successfully",
      data: eventSpace,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deleteEventSpace(req, res, next) {
  try {
    const { eventSpaceId } = req.params;

    const eventSpace = await service.deleteEventSpace(eventSpaceId);

    return res.status(200).json({
      success: true,
      message: "Event space details deleted successfully",
      data: eventSpace,
    });
  } catch (err) {
    return next(err);
  }
}
