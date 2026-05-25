import * as service from "../../services/plan.service.js";

export const createPricingPlan = async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const plan = await service.createPlan(spaceId, req.body, req.user);
    return res.status(201).json({ message: "Plan created", data: plan });
  } catch (err) {
    // validation / business messages should be 400
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const listAllPricingPlans = async (req, res) => {
  try {
    const plans = await service.listAllPlans(req.user);

    if (!plans || plans.length === 0) {
      return res.status(404).json({ message: "No pricing plans found" });
    }

    return res.status(200).json({
      message: "All pricing plans fetched",
      data: plans,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const listPricingPlans = async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const plans = await service.listPlans(spaceId, req.user);
    if (!plans || plans.length === 0) {
      return res
        .status(404)
        .json({ message: "No active pricing plans found for this space" });
    }
    return res.status(200).json({ message: "Plans fetched", data: plans });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const updatePricingPlan = async (req, res) => {
  try {
    const { spaceId, planId } = req.params;
    const plan = await service.updatePlan(
      spaceId,
      planId,
      req.body,
      req.user,
    );
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    return res.status(200).json({ message: "Plan updated", data: plan });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const deletePricingPlan = async (req, res) => {
  try {
    const { spaceId, planId } = req.params;
    const ok = await service.deletePlan(spaceId, planId, req.user);
    if (!ok) return res.status(404).json({ message: "Plan not found" });
    return res.status(200).json({ message: "Plan deleted" });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
};
