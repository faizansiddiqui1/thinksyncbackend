import * as service from "../../services/virtualOfficePlan.service.js";

export async function createVirtualOfficePlan(req, res, next) {
  try {
    const { spaceId } = req.params;

    const plan = await service.createVirtualOfficePlanForSpace(
      spaceId,
      req.body,
      req.user?.id || null,
    );

    return res.status(201).json({
      success: true,
      message: "Virtual office plan created successfully",
      data: plan,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getVirtualOfficePlansBySpace(req, res, next) {
  try {
    const { spaceId } = req.params;

    const opts = {
      activeOnly: req.query.active === "true",
      category: req.query.category || undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
      skip: req.query.skip ? parseInt(req.query.skip, 10) : undefined,
      sort: req.query.sort || "order durationMonths",
    };

    const plans = await service.getVirtualOfficePlansBySpace(spaceId, opts);

    return res.status(200).json({
      success: true,
      count: plans.length,
      data: plans,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getVirtualOfficePlanById(req, res, next) {
  try {
    const { planId } = req.params;

    const plan = await service.getVirtualOfficePlanById(planId);

    return res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateVirtualOfficePlan(req, res, next) {
  try {
    const { planId } = req.params;

    const plan = await service.updateVirtualOfficePlan(
      planId,
      req.body,
      req.user?.id || null,
    );

    return res.status(200).json({
      success: true,
      message: "Virtual office plan updated successfully",
      data: plan,
    });
  } catch (err) {
    return next(err);
  }
}

export async function deleteVirtualOfficePlan(req, res, next) {
  try {
    const { planId } = req.params;

    const plan = await service.deleteVirtualOfficePlan(planId);

    return res.status(200).json({
      success: true,
      message: "Virtual office plan deleted successfully",
      data: plan,
    });
  } catch (err) {
    return next(err);
  }
}