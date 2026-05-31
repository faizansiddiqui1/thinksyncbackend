import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Tenant from "../../models/admin_models/tenant.model.js";
import User from "../../models/user_models/User.js";
import MarketplaceAudit from "../../models/super_admin_models/MarketplaceAudit.js";

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWhiteLabelState(admin) {
  return {
    status: admin.whiteLabel?.status || "none",
    approvedAt: admin.whiteLabel?.approvedAt || null,
    approvedBy: admin.whiteLabel?.approvedBy || null,
    rejectedAt: admin.whiteLabel?.rejectedAt || null,
    rejectedBy: admin.whiteLabel?.rejectedBy || null,
    reason: admin.whiteLabel?.reason || "",
    remarks: admin.whiteLabel?.remarks || "",
  };
}

async function createWhiteLabelAudit({
  admin,
  action,
  actor,
  notes = "",
  previousState,
}) {
  return MarketplaceAudit.create({
    entityType: "white_label",
    entityId: admin._id,
    action: `white_label.${action}`,
    actorId: actor?._id || null,
    actorRole: actor?.role || "",
    previousState,
    nextState: buildWhiteLabelState(admin),
    notes: String(notes || "").trim(),
  });
}

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
    const { status = "all", page = 1, limit = 20, search = "" } = req.query;
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const skip = (safePage - 1) * safeLimit;

    const statusQuery =
      status && status !== "all"
        ? { "whiteLabel.status": status }
        : {
            "whiteLabel.status": {
              $in: ["pending", "approved", "rejected"],
            },
          };
    const query = { ...statusQuery };
    const normalizedSearch = String(search || "").trim();

    if (normalizedSearch) {
      const regex = new RegExp(escapeRegex(normalizedSearch), "i");
      const matchingUsers = await User.find({
        $or: [{ username: regex }, { email: regex }, { phoneNumber: regex }],
      })
        .select("_id")
        .lean();

      query.$or = [
        { "company.name": regex },
        { "whiteLabel.request.businessName": regex },
        { "whiteLabel.request.requestedDomain": regex },
        { "whiteLabel.domain.requestedDomain": regex },
        { owner: { $in: matchingUsers.map((item) => item._id) } },
      ];
    }

    const [items, total, statusCounts] = await Promise.all([
      AdminProfile.find(query)
        .populate("owner", "username email phoneNumber role")
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      AdminProfile.countDocuments(query),
      AdminProfile.aggregate([
        {
          $match: {
            "whiteLabel.status": { $in: ["pending", "approved", "rejected"] },
          },
        },
        { $group: { _id: "$whiteLabel.status", count: { $sum: 1 } } },
      ]),
    ]);
    const itemIds = items.map((item) => item._id);
    const activity = itemIds.length
      ? await MarketplaceAudit.find({
          entityType: "white_label",
          entityId: { $in: itemIds },
        })
          .populate("actorId", "username email role")
          .sort({ createdAt: -1 })
          .lean()
      : [];
    const activityMap = new Map();
    activity.forEach((item) => {
      const key = String(item.entityId);
      if (!activityMap.has(key)) activityMap.set(key, []);
      activityMap.get(key).push(item);
    });

    return res.json({
      success: true,
      data: {
        items: items.map((item) => ({
          ...item,
          activityTimeline: activityMap.get(String(item._id)) || [],
        })),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.max(Math.ceil(total / safeLimit), 1),
        },
        stats: {
          total: statusCounts.reduce((sum, item) => sum + item.count, 0),
          ...Object.fromEntries(
            statusCounts.map((item) => [item._id, item.count]),
          ),
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
      remarks = "",
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

    if (!["pending", "rejected"].includes(admin.whiteLabel?.status)) {
      return res.status(400).json({
        success: false,
        message: "Only pending or rejected requests can be approved",
      });
    }
    const previousState = buildWhiteLabelState(admin);

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
    admin.whiteLabel.remarks = String(remarks || "").trim();

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
    await createWhiteLabelAudit({
      admin,
      action: "approved",
      actor: req.user,
      notes: remarks,
      previousState,
    });

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
    const { adminProfileId, reason = "", remarks = "" } = req.body;

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
    if (!["pending", "approved"].includes(admin.whiteLabel?.status)) {
      return res.status(400).json({
        success: false,
        message: "Only pending or approved requests can be rejected",
      });
    }
    const previousState = buildWhiteLabelState(admin);

    admin.whiteLabel.status = "rejected";
    admin.whiteLabel.approvedAt = null;
    admin.whiteLabel.approvedBy = null;
    admin.whiteLabel.rejectedAt = new Date();
    admin.whiteLabel.rejectedBy = req.user._id;
    admin.whiteLabel.reason = reason || "Rejected by super admin";
    admin.whiteLabel.remarks = String(remarks || "").trim();

    await admin.save();
    await Tenant.findOneAndUpdate(
      { adminProfileId: admin._id },
      { $set: { status: "suspended" } },
    );
    await createWhiteLabelAudit({
      admin,
      action: "rejected",
      actor: req.user,
      notes: reason || remarks,
      previousState,
    });

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
