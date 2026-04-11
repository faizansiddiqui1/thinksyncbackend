import AdminProfile from "../../models/admin_models/AdminProfile.js";
import TenantSecrets from "../../models/admin_models/TenantSecrets.js";


export const requestWhiteLabel = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ message: "Domain required" });
    }

    const admin = await AdminProfile.findOne({ owner: adminId });

    admin.whiteLabel.requestedDomain = domain;
    admin.whiteLabel.status = "pending";

    await admin.save();

    res.json({
      success: true,
      message: "White-label request submitted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



export const uploadSecrets = async (req, res) => {
  try {
    const tenant = req.tenant;
    console.log("Tenant", tenant);
    
    const data = req.body;

    const secrets = await TenantSecrets.findOneAndUpdate(
      { tenantId: tenant._id },
      { $set: data },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: "Secrets saved",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}; 