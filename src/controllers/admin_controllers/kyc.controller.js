import AdminProfile from "../../models/admin_models/AdminProfile.js";
import User from "../../models/user_models/User.js";

/**
 * GET /admin/profile
 */
export const getAdminProfile = async (req, res) => {
  return res.json({
    profile: req.adminProfile,
    kyc: req.adminProfile?.kyc || { status: "not_submitted" },
  });
};

/**
 * POST /admin/kyc/submit
 */
export const submitKyc = async (req, res) => {
  const { documents, company } = req.body;

  if (!documents || documents.length === 0) {
    return res.status(400).json({ message: "Documents required" });
  }

  if (req.adminProfile.kyc.status === "approved") {
    return res.status(400).json({ message: "KYC already approved" });
  }

  req.adminProfile.company = company || req.adminProfile.company;

  req.adminProfile.kyc.documents = documents.map((d) => ({
    type: d.type,
    key: d.key,
    uploadedAt: new Date(),
    status: "uploaded",
  }));

  req.adminProfile.kyc.status = "pending";
  req.adminProfile.kyc.submittedAt = new Date();

  await req.adminProfile.save();

  // Optional: User kyc sync
  const user = await User.findById(req.user._id);
  user.kyc.status = "pending";
  await user.save();

  return res.json({
    success: true,
    message: "KYC submitted successfully",
  });
};

/**
 * POST /admin/kyc/approve/:adminProfileId
 */
export const approveKyc = async (req, res) => {
  const { adminProfileId } = req.params;

  const adminProfile = await AdminProfile.findById(adminProfileId);
  if (!adminProfile) {
    return res.status(404).json({ message: "Admin profile not found" });
  }

  if (req.user.role !== "super_admin" && req.user.role !== "admin") {
    return res.status(403).json({ message: "Super admin or admin access required" });
  }

  adminProfile.kyc.status = "approved";
  adminProfile.kyc.reviewedAt = new Date();
  adminProfile.kyc.reviewedBy = req.user._id;

  await adminProfile.save();

  // Promote user to admin
  await User.findByIdAndUpdate(adminProfile.owner, {
    role: "admin",
  });

  // Optional: User kyc bhi sync kar do (agar customer KYC ke liye use karna hai)
  const user = await User.findById(adminProfile.owner);
  user.kyc.status = "approved";
  await user.save();

  return res.json({
    success: true,
    message: "Admin KYC approved",
  });
};

/**
 * POST /admin/kyc/reject/:adminProfileId
 */
export const rejectKyc = async (req, res) => {
  const { adminProfileId } = req.params;
  const { reason } = req.body;

  const adminProfile = await AdminProfile.findById(adminProfileId);
  if (!adminProfile) {
    return res.status(404).json({ message: "Admin profile not found" });
  }

  if (req.user.role !== "super_admin") {
    return res.status(403).json({ message: "Super admin access required" });
  }

  adminProfile.kyc.status = "rejected";
  adminProfile.kyc.reviewedAt = new Date();
  adminProfile.kyc.reviewedBy = req.user._id;
  adminProfile.kyc.reason = reason || "Not specified";

  await adminProfile.save();

  return res.json({
    success: true,
    message: "Admin KYC rejected",
  });
};
