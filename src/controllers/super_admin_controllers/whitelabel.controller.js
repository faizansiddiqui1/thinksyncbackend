// controllers/superadmin.controller.js

import AdminProfile from "../../models/admin_models/AdminProfile.js";

export const approveWhiteLabel = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await AdminProfile.findByIdAndUpdate(
      adminId,
      {
        "whiteLabel.status": "approved",
        "whiteLabel.approvedAt": new Date(),
        "whiteLabel.approvedBy": req.user._id
      },
      { new: true }
    );

    return res.json({ success: true, data: admin });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};