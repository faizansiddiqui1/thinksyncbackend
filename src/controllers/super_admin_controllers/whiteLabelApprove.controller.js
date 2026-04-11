import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Tenant from "../../models/admin_models/tenant.model.js";


export const approveWhiteLabel = async (req, res) => {
  try {
    const { adminProfileId } = req.body;

    const admin = await AdminProfile.findById(adminProfileId);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // ❗ important validation
    // if (!admin.company?.name) {
    //   return res.status(400).json({
    //     message: "Company name required before approval",
    //   });
    // }

    if (!admin.whiteLabel?.requestedDomain) {
      return res.status(400).json({
        message: "Domain not requested",
      });
    }

    // ✅ existing tenant check
    const existingTenant = await Tenant.findOne({
      adminProfileId: admin._id,
    });

    if (existingTenant) {
      return res.json({ message: "Tenant already exists" });
    }

    // 🔥 CREATE TENANT
    const tenant = await Tenant.create({
      name: admin.company.name,
      domain: admin.whiteLabel.requestedDomain,
      adminProfileId: admin._id,
      ownerId: admin.owner,
    });

    // ✅ update admin
    admin.whiteLabel.status = "approved";
    admin.whiteLabel.approvedAt = new Date();
    admin.whiteLabel.approvedBy = req.user._id;

    await admin.save();

    res.json({
      success: true,
      message: "Approved & Tenant created",
      tenant,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};