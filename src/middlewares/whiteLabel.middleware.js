// middlewares/whiteLabel.middleware.js

import AdminProfile from "../models/admin_models/AdminProfile.js";

export const requireWhiteLabel = async (req, res, next) => {
  try {
    const adminId = req.user._id; // auth middleware se

    const admin = await AdminProfile.findById(adminId).select("whiteLabel");

    if (!admin || admin.whiteLabel?.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: "White-label access not approved yet"
      });
    }

    next();

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};