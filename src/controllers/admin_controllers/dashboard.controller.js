import { getOwnerDashboardSnapshot } from "../../services/ownerDashboard.service.js";

export async function getOwnerDashboard(req, res) {
  try {
    const data = await getOwnerDashboardSnapshot(req.user, {
      months: req.query.months,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Failed to load owner dashboard",
    });
  }
}
