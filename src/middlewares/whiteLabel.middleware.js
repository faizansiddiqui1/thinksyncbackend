// middlewares/whiteLabel.middleware.js

import AdminProfile from "../models/admin_models/AdminProfile.js";


export const canRequestWhiteLabel = async (req, res, next) => {
  try {
    const user = req.user;

    // ❌ role check
    if (user.role !== "admin" && user.role !== "super_admin") {
      return res.status(403).json({
        message: "Only admin can request white-label",
      });
    }

    const admin = await AdminProfile.findOne({ owner: user._id });

    if (!admin) {
      return res.status(404).json({
        message: "Admin profile not found",
      });
    }

    // ❌ KYC check
    if (admin.kyc.status !== "approved") {
      return res.status(403).json({
        message: "KYC must be approved first",
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



export const requireWhiteLabel = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized: user missing",
      });
    }

    const userId = req.user._id;

    const admin = await AdminProfile.findOne({ owner: userId }).select("whiteLabel");

    if (!admin || admin.whiteLabel?.status !== "approved") {
      return res.status(403).json({
        error: "White-label access not approved yet",
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};