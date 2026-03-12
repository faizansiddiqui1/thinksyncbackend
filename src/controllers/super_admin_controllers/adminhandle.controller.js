import AdminProfile from "../../models/admin_models/AdminProfile.js";

// Update specific admin config by admin id = user._id
export async function updateKycConfig(req, res) {
  try {
    const { adminId } = req.params;
    const config = req.body;

    const admin = await AdminProfile.findOne({ owner: adminId });
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    admin.kyc.config = {
      ...admin.kyc.config,
      ...config,
    };

    await admin.save();

    res.json({
      success: true,
      message: "KYC config updated",
      config: admin.kyc.config,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// update existing config for  all admins 
export async function updateGlobalKycConfig(req, res) {
  try {
    const update = req.body;

    // update all admin profiles
    await AdminProfile.updateMany(
      { "company.name": { $ne: "GLOBAL_DEFAULT" } },
      {
        $set: Object.fromEntries(
          Object.entries(update).map(([k, v]) => [`kyc.config.${k}`, v]),
        ),
      },
    );

    res.json({
      success: true,
      message: "Global KYC config updated for all admins",
      config: update,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// Update default config for upcoming admins via superadmin
export async function updateDefaultKycConfig(req, res) {
  try {
    const update = req.body;

    const global = await AdminProfile.findOne({
      "company.name": "GLOBAL_DEFAULT",
    });

    if (!global) {
      return res.status(404).json({ message: "Default config not found" });
    }

    global.kyc.config = {
      ...global.kyc.config,
      ...update,
    };

    await global.save();

    res.json({
      success: true,
      message: "Default config updated",
      config: global.kyc.config,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
