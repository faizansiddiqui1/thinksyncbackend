import * as service from "../../services/masterPlan.service.js";

export async function listMasterPlans(req, res) {
  try {
    const filters = req.user?.role === "super_admin" ? req.query : { ...req.query, status: "active" };
    const plans = await service.listMasterPlans(filters);
    return res.json({ success: true, data: { plans } });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

export async function createMasterPlan(req, res) {
  try {
    if (req.user?.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "Super admin access required" });
    }
    const plan = await service.createMasterPlan(req.body, req.user);
    return res.status(201).json({ success: true, data: { plan } });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

export async function updateMasterPlan(req, res) {
  try {
    if (req.user?.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "Super admin access required" });
    }
    const plan = await service.updateMasterPlan(req.params.id, req.body, req.user);
    if (!plan) return res.status(404).json({ success: false, error: "Master plan not found" });
    return res.json({ success: true, data: { plan } });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}

export async function deleteMasterPlan(req, res) {
  try {
    if (req.user?.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "Super admin access required" });
    }
    const ok = await service.deleteMasterPlan(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Master plan not found" });
    return res.json({ success: true });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.message });
  }
}
