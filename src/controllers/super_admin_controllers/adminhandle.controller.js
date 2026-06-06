import AdminProfile from "../../models/admin_models/AdminProfile.js";
import {
  ensureGlobalKycConfig,
  updateGlobalKycConfig as saveGlobalKycConfig,
} from "../../services/globalKycConfig.service.js";
import { reconcileAdminKycApprovals } from "../../services/kycApproval.service.js";

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

export async function getGlobalKycConfig(req, res) {
  try {
    const state = await ensureGlobalKycConfig();
    return res.json({
      success: true,
      message: state.created
        ? "Global KYC config created with safe defaults"
        : "Global KYC config loaded",
      data: state,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createGlobalKycConfig(req, res) {
  try {
    const state = await saveGlobalKycConfig(req.body || {});
    const reconciliation = await reconcileAdminKycApprovals();
    return res.status(state.created ? 201 : 200).json({
      success: true,
      message: state.created
        ? "Global KYC config created"
        : "Global KYC config already existed and was updated",
      data: { ...state, reconciliation },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// Update the marketplace-wide default used by KYC flows.
export async function updateGlobalKycConfig(req, res) {
  try {
    const state = await saveGlobalKycConfig(req.body || {});
    const reconciliation = await reconcileAdminKycApprovals();
    return res.json({
      success: true,
      message: "Global KYC config updated",
      data: { ...state, reconciliation },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// Update default config for upcoming admins via superadmin
export async function updateDefaultKycConfig(req, res) {
  try {
    const state = await saveGlobalKycConfig(req.body || {});
    const reconciliation = await reconcileAdminKycApprovals();
    return res.json({
      success: true,
      message: "Default config updated",
      data: { ...state, reconciliation },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
