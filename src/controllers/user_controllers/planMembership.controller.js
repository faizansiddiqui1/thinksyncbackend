import * as service from "../../services/planMembership.service.js";

export async function purchasePlan(req, res) {
  try {
    const result = await service.purchasePlan(req.user, req.body);
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getMyPlans(req, res) {
  try {
    const result = await service.getMyPlans(req.user._id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function createPlanReservation(req, res) {
  try {
    const result = await service.createPlanReservation(req.user, req.body);
    return res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function getPlanAnalytics(req, res) {
  try {
    const result = await service.getPlanAnalytics(req.user);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export async function listAdminPlanPurchases(req, res) {
  try {
    const result = await service.listAdminPlanPurchases(req.user, req.query);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
