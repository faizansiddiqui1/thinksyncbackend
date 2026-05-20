import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Tenant from "../../models/admin_models/tenant.model.js";

function normalizeDomain(domain = "") {
  return String(domain || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function generateInternalTenantDomain(adminId) {
  return `tenant-${String(adminId).slice(-8)}`;
}

export const getWhiteLabelRequests = async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const query = {
      "whiteLabel.status": status,
    };

    const [items, total] = await Promise.all([
      AdminProfile.find(query)
        .populate("owner", "username email phoneNumber role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AdminProfile.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const approveWhiteLabel = async (req, res) => {
  try {
    const {
      adminProfileId,
      customDomain = false,
      customBranding = false,
      privateMode = false,
      allowOwnCredentials = false,
    } = req.body;

    if (!adminProfileId) {
      return res.status(400).json({
        success: false,
        message: "adminProfileId required",
      });
    }

    const admin = await AdminProfile.findById(adminProfileId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (admin.whiteLabel?.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending requests can be approved",
      });
    }

    const request = admin.whiteLabel?.request || {};
    const requestedDomain = normalizeDomain(request.requestedDomain || "");
    const requestWantsDomain = request.needsCustomDomain === true;
    const requestWantsOwnCreds = request.useOwnCredentials === true;

    // custom domain approval only makes sense when user requested it
    const finalCustomDomain = Boolean(requestWantsDomain && customDomain && requestedDomain);

    if (requestWantsDomain && !requestedDomain) {
      return res.status(400).json({
        success: false,
        message: "Requested domain missing in request",
      });
    }

    // own credentials only allowed when custom domain was requested
    // and the request itself wanted own credentials
    const finalUseOwnCredentials =
      finalCustomDomain && requestWantsOwnCreds && Boolean(allowOwnCredentials);

    admin.whiteLabel.status = "approved";
    admin.whiteLabel.approvedAt = new Date();
    admin.whiteLabel.approvedBy = req.user._id;

    admin.whiteLabel.permissions = {
      customDomain: finalCustomDomain,
      customBranding: finalCustomDomain && Boolean(customBranding),
      privateMode: finalCustomDomain && Boolean(privateMode),
    };

    admin.whiteLabel.useOwnPlatformCredentials = finalUseOwnCredentials;
    admin.whiteLabel.marketplaceMode = admin.whiteLabel.permissions.privateMode
      ? "private"
      : "marketplace";

    admin.whiteLabel.domain = {
      requestedDomain: requestedDomain || null,
      activeDomain: finalCustomDomain ? requestedDomain : null,
      verified: false,
      dnsConfigured: false,
    };

    let tenant = await Tenant.findOne({
      adminProfileId: admin._id,
    });

    const tenantDomain = finalCustomDomain
      ? requestedDomain
      : generateInternalTenantDomain(admin._id);

    if (!tenant) {
      tenant = await Tenant.create({
        name: admin.company?.name || request.businessName || "Workspace",
        domain: tenantDomain,
        adminProfileId: admin._id,
        ownerId: admin.owner,
        status: "active",
      });
    } else {
      tenant.name = admin.company?.name || request.businessName || tenant.name;
      tenant.domain = tenantDomain;
      tenant.status = "active";
      await tenant.save();
    }

    await admin.save();

    return res.json({
      success: true,
      message: "White-label approved successfully",
      data: {
        tenant,
        whiteLabel: admin.whiteLabel,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const rejectWhiteLabel = async (req, res) => {
  try {
    const { adminProfileId, reason = "" } = req.body;

    if (!adminProfileId) {
      return res.status(400).json({
        success: false,
        message: "adminProfileId required",
      });
    }

    const admin = await AdminProfile.findById(adminProfileId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    admin.whiteLabel.status = "rejected";
    admin.whiteLabel.approvedAt = null;
    admin.whiteLabel.approvedBy = null;
    admin.whiteLabel.reason = reason || "Rejected by super admin";

    await admin.save();

    return res.json({
      success: true,
      message: "White-label rejected successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};