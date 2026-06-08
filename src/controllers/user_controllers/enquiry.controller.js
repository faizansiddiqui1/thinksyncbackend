// controllers/enquiry.controller.js
import mongoose from "mongoose";

import Enquiry from "../../models/user_models/Enquiry.js";
import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Addon from "../../models/admin_models/AddonSchema.js";
import Space from "../../models/admin_models/Space.js";
import Consultant from "../../models/super_admin_models/Consultant.js";
import LeadEmailTemplate from "../../models/super_admin_models/LeadEmailTemplate.js";
import EmailTemplate from "../../models/super_admin_models/EmailTemplate.js";
import Role from "../../models/super_admin_models/Role.js";
import User from "../../models/user_models/User.js";
import sendEmailWithFallback from "../../utils/sendEmailWithFallback.js";
import { sendEnquiryConfirmationEmail } from "../../services/mail.service.js";
import {
  assignMatchingConsultant,
  buildRoutingContext,
  getConsultantForUser,
  normalizeListingMode,
  releaseConsultantAssignment,
} from "../../services/consultantRouting.service.js";
import {
  getCompanySpaceIds,
  getScopeOwnerId,
  isSuperAdminUser,
} from "../../services/spaceAccess.service.js";

const ALLOWED_STATUSES = [
  "new",
  "contacted",
  "interested",
  "follow-up",
  "qualified",
  "closed",
  "lost",
  "converted",
  "rejected",
];

const cleanOptional = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return value;
  return value.trim();
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cleanUtm = (value = {}) => ({
  source: cleanOptional(value.source || value.utm_source),
  medium: cleanOptional(value.medium || value.utm_medium),
  campaign: cleanOptional(value.campaign || value.utm_campaign),
  term: cleanOptional(value.term || value.utm_term),
  content: cleanOptional(value.content || value.utm_content),
});

const normalizeLeadSource = (value = "") =>
  String(value || "website").trim().toLowerCase().replace(/[\s-]+/g, "_");

const uniqueObjectIds = (values = []) => {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return false;
    const key = String(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function resolveAddonLead(body = {}) {
  const addonId = body.addonId || body.serviceId;
  if (!addonId || !mongoose.Types.ObjectId.isValid(String(addonId))) return null;

  return Addon.findById(addonId)
    .populate({
      path: "space",
      select: "name slug owner spaceType listingModes address",
      populate: { path: "address.city", select: "name slug" },
    })
    .lean();
}

async function resolveWorkspaceRecipients(space = null) {
  const ownerUserId = space?.owner || null;
  if (!ownerUserId) {
    return {
      ownerUserId: null,
      workspaceTeamUserIds: [],
      recipientUserIds: [],
    };
  }

  const roleIds = await Role.find({ createdBy: ownerUserId }).distinct("_id");
  const workspaceTeam = roleIds.length
    ? await User.find({
        customRoles: { $in: roleIds },
        isActive: true,
      })
        .select("_id")
        .lean()
    : [];

  const workspaceTeamUserIds = workspaceTeam.map((user) => user._id);

  return {
    ownerUserId,
    workspaceTeamUserIds,
    recipientUserIds: uniqueObjectIds([ownerUserId, ...workspaceTeamUserIds]),
  };
}

const getRequestDevice = (req, bodyDevice = {}) => ({
  userAgent: cleanOptional(bodyDevice.userAgent || req.headers["user-agent"]),
  ip: cleanOptional(
    bodyDevice.ip ||
      req.headers["x-forwarded-for"]?.split(",")?.[0] ||
      req.socket?.remoteAddress,
  ),
  referrer: cleanOptional(bodyDevice.referrer || req.headers.referer || req.headers.referrer),
});

const renderLeadTemplate = (template = "", lead = {}) => {
  const values = {
    leadName: lead.name || "",
    name: lead.name || "",
    company: lead.companyName || "",
    companyName: lead.companyName || "",
    city: lead.city || "",
    product: lead.product || "",
    listingName: lead.listingName || lead.spaceId?.name || "",
    listing: lead.listingName || lead.spaceId?.name || "",
    consultantName: lead.consultantId?.name || "",
    leadName: lead.name || "",
    leadCity: lead.city || "",
    leadProduct: lead.product || "",
    leadListingMode: lead.listingMode || "",
    enquiryId: lead._id || "",
    enquiryService: lead.serviceName || lead.product || "",
    userName: lead.name || "",
    workspaceName: lead.listingName || lead.spaceId?.name || "",
  };

  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    return values[key] ?? "";
  });
};

const buildLeadRoutingPayload = async (req, body = {}) => {
  const addon = await resolveAddonLead(body);
  const addonSpace = addon?.space || null;
  const listingId =
    addonSpace?._id || body.listingId || body.spaceId || null;
  const leadSource = normalizeLeadSource(body.leadSource);
  const isLandingLead =
    leadSource === "landing_request_callback" ||
    body.pageType === "request_callback";
  const isAddonServiceLead = addon?.type === "service";
  const routeToConsultant = !isLandingLead && !isAddonServiceLead;
  const routingInput = {
    ...body,
    listingId,
    spaceId: listingId,
    listingSlug: addonSpace?.slug || body.listingSlug,
    city:
      addonSpace?.address?.city?._id ||
      addonSpace?.address?.city?.slug ||
      body.city,
    product:
      addonSpace?.spaceType ||
      body.product ||
      body.productType,
    spaceType: addonSpace?.spaceType || body.spaceType || body.listingType,
    listingMode: body.listingMode,
    pageType: body.pageType,
    sourceUrl: body.sourceUrl,
  };
  const routed = routeToConsultant
    ? await assignMatchingConsultant(routingInput)
    : {
        consultantDoc: null,
        context: await buildRoutingContext(routingInput),
        match: null,
      };

  const consultantDoc = routed.consultantDoc || null;
  const context = routed.context || {};
  const listingSpace =
    addonSpace ||
    (context.listing?._id
      ? await Space.findById(context.listing._id)
          .select("owner name slug spaceType listingModes")
          .lean()
      : null);
  const ownership = await resolveWorkspaceRecipients(listingSpace);
  const leadCategory = isLandingLead
    ? "landing_page"
    : isAddonServiceLead
      ? "addon_service"
      : listingId
        ? "workspace"
        : "service";
  const assignmentMethod = isLandingLead
    ? "admin_only"
    : isAddonServiceLead
      ? "owner_distribution"
      : routed.match?.method || "unassigned";

  return {
    consultantId: consultantDoc?._id || null,
    listingId: context.listing?._id || listingId || null,
    listingName: cleanOptional(
      addonSpace?.name ||
        context.listing?.name ||
        body.listingName ||
        body.listingTitle ||
        body.spaceName,
    ),
    listingSlug: cleanOptional(
      addonSpace?.slug || context.listing?.slug || body.listingSlug,
    ),
    listingMode: normalizeListingMode(context.listingMode || body.listingMode),
    city: cleanOptional(context.cityName || body.cityName || body.city),
    product: cleanOptional(context.productType || body.product || body.productType),
    spaceType: cleanOptional(context.spaceType || body.spaceType || body.listingType),
    pageType: cleanOptional(context.pageType || body.pageType || body.sourcePage),
    sourceUrl: cleanOptional(context.sourceUrl || body.sourceUrl || body.sourceURL),
    addonId: isAddonServiceLead ? addon._id : null,
    serviceName: isAddonServiceLead ? addon.title : "",
    leadSource,
    leadCategory,
    ...ownership,
    recipientUserIds: isAddonServiceLead ? ownership.recipientUserIds : [],
    assignmentMethod,
    assignmentConfidence: routed.match?.confidence || assignmentMethod,
    assignmentScore: routed.match?.score ?? null,
    lastActivityAt: new Date(),
    utm: cleanUtm(body.utm || body),
    device: getRequestDevice(req, body.device || {}),
    assignmentHistory: consultantDoc?._id
      ? [
          {
            consultant: consultantDoc._id,
            previousConsultant: null,
            assignedBy: null,
            method: routed.match?.method || "automated_exact",
            reason: routed.match?.confidence || "routing",
            assignedAt: new Date(),
          },
        ]
      : [],
  };
};

function buildLeadFilter(query = {}) {
  const filter = {};

  if (query.status) filter.status = query.status;
  if (query.city) filter.city = { $regex: String(query.city), $options: "i" };
  if (query.product) filter.product = String(query.product);
  if (query.source) filter.source = query.source;
  if (query.leadSource) filter.leadSource = query.leadSource;
  if (query.leadCategory) filter.leadCategory = query.leadCategory;
  if (query.listingMode) {
    filter.listingMode = normalizeListingMode(query.listingMode);
  }
  if (query.consultantId && mongoose.Types.ObjectId.isValid(String(query.consultantId))) {
    filter.consultantId = query.consultantId;
  }

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }

  if (query.q) {
    const q = String(query.q).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phoneNumber: { $regex: q, $options: "i" } },
      { companyName: { $regex: q, $options: "i" } },
      { listingName: { $regex: q, $options: "i" } },
    ];
  }

  return filter;
}

function mergeFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length);
  if (!active.length) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

async function buildLeadAccessFilter(req) {
  if (isSuperAdminUser(req.user)) return {};

  const actorId = req.user?._id || null;
  const companySpaceIds = await getCompanySpaceIds(req.user);
  const ownerId = await getScopeOwnerId(req.user);
  let ownedSpaceIds = [];

  if (ownerId) {
    ownedSpaceIds = await Space.find({ owner: ownerId }).distinct("_id");
  }

  const spaceIds = uniqueObjectIds([...companySpaceIds, ...ownedSpaceIds]);
  const access = [];

  if (actorId) access.push({ recipientUserIds: actorId });
  if (ownerId) access.push({ ownerUserId: ownerId });
  if (spaceIds.length) access.push({ spaceId: { $in: spaceIds } });

  const ownershipFilter = access.length ? { $or: access } : { _id: null };

  // Admin/company users manage operational marketplace leads only here.
  // Platform-wide workspace and landing leads remain Super Admin/consultant surfaces.
  return {
    $and: [
      { leadCategory: "addon_service" },
      ownershipFilter,
    ],
  };
}

function buildBaseLeadPayload({
  name,
  email,
  phoneNumber,
  companyName,
  budget,
  details,
  spaceId,
  body,
  leadRoutingPayload,
}) {
  return {
    name: cleanOptional(name),
    email: cleanOptional(email).toLowerCase(),
    phoneNumber: cleanOptional(phoneNumber),
    companyName: cleanOptional(companyName),
    budget: cleanOptional(budget),
    details: cleanOptional(details),
    teamSize: body.teamSize ? Number(body.teamSize) : null,
    moveInDate: body.moveInDate || null,
    preferredContactMethod: body.preferredContactMethod || "any",
    resourceId: body.resourceId || null,
    spaceId: spaceId || leadRoutingPayload.listingId || null,
    ...leadRoutingPayload,
    priority: body.priority || "medium",
    status: "new",
  };
}

async function userCanOperateLead(req, leadId) {
  if (req.user?.role === "super_admin") return true;
  if (req.user?.role !== "consultant") {
    const accessFilter = await buildLeadAccessFilter(req);
    return Boolean(
      await Enquiry.exists(
        mergeFilters({ _id: leadId }, accessFilter),
      ),
    );
  }

  const consultant = await getConsultantForUser(req.user._id);
  if (!consultant?._id) return false;

  const lead = await Enquiry.findById(leadId).select("consultantId").lean();
  return Boolean(lead && String(lead.consultantId || "") === String(consultant._id));
}

function queueEnquiryConfirmation(enquiry) {
  sendEnquiryConfirmationEmail({ enquiry }).catch((error) => {
    console.error(
      "enquiry confirmation email failed:",
      error.message,
    );
  });
}

function queueLeadRecipientNotifications(enquiry) {
  if (
    enquiry?.leadCategory !== "addon_service" ||
    !enquiry?.recipientUserIds?.length
  ) {
    return;
  }

  User.find({
    _id: { $in: enquiry.recipientUserIds },
    email: { $exists: true, $ne: "" },
    isActive: true,
  })
    .select("email displayName username")
    .lean()
    .then((recipients) =>
      Promise.allSettled(
        recipients.map((recipient) =>
          sendEmailWithFallback({
            to: recipient.email,
            subject: `New add-on service enquiry: ${enquiry.serviceName || enquiry.listingName}`,
            html: `
              <p>Hello ${escapeHtml(recipient.displayName || recipient.username || "Team")},</p>
              <p>A new add-on service enquiry was submitted for <strong>${escapeHtml(enquiry.listingName || "your workspace")}</strong>.</p>
              <p><strong>Service:</strong> ${escapeHtml(enquiry.serviceName || "-")}</p>
              <p><strong>Customer:</strong> ${escapeHtml(enquiry.name || "-")}</p>
              <p><strong>Email:</strong> ${escapeHtml(enquiry.email || "-")}</p>
              <p><strong>Phone:</strong> ${escapeHtml(enquiry.phoneNumber || "-")}</p>
              <p>Open the ThinkSync lead panel to review and follow up.</p>
            `,
          }),
        ),
      ),
    )
    .catch((error) => {
      console.error("lead recipient notification failed:", error.message);
    });
}

// Public create enquiry
export const createEnquiry = async (req, res) => {
  let reservedConsultantId = null;

  try {
    const authUser = req.user || null;

    let {
      name,
      email,
      phoneNumber,
      companyName,
      budget,
      details,
      spaceId,
    } = req.body;

    if (!authUser && (!name || !email || !phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: "name, email and phoneNumber are required",
      });
    }

    const leadRoutingPayload = await buildLeadRoutingPayload(req, req.body || {});
    reservedConsultantId = leadRoutingPayload.consultantId || null;

    if (authUser) {
      email = authUser.email || email;
      phoneNumber = authUser.phoneNumber || phoneNumber;

      const adminProfile = await AdminProfile.findOne({ owner: authUser._id }).select(
        "company.name",
      );

      const isAdminLike = ["pending_admin", "admin", "super_admin"].includes(
        authUser.role,
      );

      if (!name) {
        name =
          authUser.username ||
          authUser.name ||
          (adminProfile?.company?.name ? adminProfile.company.name : "");
      }

      if (!companyName && adminProfile?.company?.name) {
        companyName = adminProfile.company.name;
      }

      const enquiry = await Enquiry.create({
        ...buildBaseLeadPayload({
          name,
          email,
          phoneNumber,
          companyName,
          budget,
          details,
          spaceId,
          body: req.body,
          leadRoutingPayload,
        }),
        submittedByUser: authUser._id,
        submittedByAdminProfile: adminProfile?._id || null,
        submittedByRole: authUser.role || "user",
        source: isAdminLike ? "logged_in_admin" : "logged_in_user",
      });

      queueEnquiryConfirmation(enquiry);
      queueLeadRecipientNotifications(enquiry);
      reservedConsultantId = null;

      return res.status(201).json({
        success: true,
        message: "Enquiry created successfully",
        data: enquiry,
      });
    }

    const enquiry = await Enquiry.create({
      ...buildBaseLeadPayload({
        name,
        email,
        phoneNumber,
        companyName,
        budget,
        details,
        spaceId,
        body: req.body,
        leadRoutingPayload,
      }),
      source: "public_form",
      submittedByRole: "public",
    });

    queueEnquiryConfirmation(enquiry);
    queueLeadRecipientNotifications(enquiry);
    reservedConsultantId = null;

    return res.status(201).json({
      success: true,
      message: "Enquiry created successfully",
      data: enquiry,
    });
  } catch (err) {
    if (reservedConsultantId) {
      await releaseConsultantAssignment(reservedConsultantId).catch(() => null);
    }
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: list enquiries
export const getAllEnquiries = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = mergeFilters(
      buildLeadFilter(req.query),
      await buildLeadAccessFilter(req),
    );
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("submittedByUser", "email username phoneNumber role isActive")
        .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
        .populate("consultantId", "name email phone designation profileImage")
        .populate("spaceId", "title name spaceType location slug")
        .populate("addonId", "title type category")
        .populate("ownerUserId", "username displayName email phoneNumber")
        .populate("workspaceTeamUserIds", "username displayName email phoneNumber")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Enquiry.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      data: items,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: get single enquiry
export const getEnquiryById = async (req, res) => {
  try {
    const enquiry = await Enquiry.findOne(
      mergeFilters(
        { _id: req.params.id },
        await buildLeadAccessFilter(req),
      ),
    )
      .populate("submittedByUser", "email username phoneNumber role isActive")
      .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
      .populate("consultantId", "name email phone designation profileImage")
      .populate("spaceId", "title name spaceType location slug")
      .populate("addonId", "title type category")
      .populate("ownerUserId", "username displayName email phoneNumber")
      .populate("workspaceTeamUserIds", "username displayName email phoneNumber")
      .populate("assignedSpaceId", "title name spaceType location slug")
      .populate("convertedCompanyId", "name type status")
      .populate("assignmentHistory.consultant", "name email")
      .populate("assignmentHistory.previousConsultant", "name email")
      .populate("assignmentHistory.assignedBy", "email username")
      .populate("leadNotes.addedBy", "email username")
      .populate("callLogs.calledBy", "email username")
      .populate("emailLogs.sentBy", "email username");

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      data: enquiry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Super admin only: update status
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    if (!(await userCanOperateLead(req, req.params.id))) {
      return res.status(403).json({
        success: false,
        message: "You can update only assigned leads",
      });
    }

    const update = { status };
    const push = {};

    if (typeof notes === "string") {
      update.notes = notes.trim();
      if (notes.trim()) {
        push.leadNotes = {
          note: notes.trim(),
          addedBy: req.user?._id || null,
          createdAt: new Date(),
        };
      }
    }

    if (status === "contacted") update.contactedAt = new Date();
    if (status === "converted" || status === "closed") update.convertedAt = new Date();
    update.lastActivityAt = new Date();

    const mongoUpdate = Object.keys(push).length
      ? { $set: update, $push: push }
      : { $set: update };

    const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, mongoUpdate, {
      new: true,
    }).populate("consultantId", "name email phone designation profileImage");

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      message: "Enquiry updated successfully",
      data: enquiry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const assignEnquiryConsultant = async (req, res) => {
  try {
    const { consultantId, reason = "manual_reassignment" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(String(consultantId))) {
      return res.status(400).json({ success: false, message: "Valid consultantId required" });
    }

    const consultant = await Consultant.findById(consultantId);
    if (!consultant) {
      return res.status(404).json({ success: false, message: "Consultant not found" });
    }

    const existing = await Enquiry.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }

    existing.assignmentHistory.push({
      consultant: consultant._id,
      previousConsultant: existing.consultantId || null,
      assignedBy: req.user?._id || null,
      method: "manual",
      reason,
      assignedAt: new Date(),
    });
    existing.consultantId = consultant._id;
    existing.assignmentMethod = "manual";
    existing.assignmentConfidence = "manual";
    existing.lastActivityAt = new Date();

    await existing.save();

    const enquiry = await Enquiry.findById(existing._id).populate(
      "consultantId",
      "name email phone designation profileImage",
    );

    return res.json({
      success: true,
      message: "Lead reassigned successfully",
      data: enquiry,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const addEnquiryNote = async (req, res) => {
  try {
    const note = cleanOptional(req.body.note || req.body.notes);
    if (!note) {
      return res.status(400).json({ success: false, message: "Note is required" });
    }

    if (!(await userCanOperateLead(req, req.params.id))) {
      return res.status(403).json({
        success: false,
        message: "You can update only assigned leads",
      });
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      {
        $set: { notes: note },
        $currentDate: { lastActivityAt: true },
        $push: {
          leadNotes: {
            note,
            addedBy: req.user?._id || null,
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }

    return res.json({ success: true, message: "Note added", data: enquiry });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const addCallLog = async (req, res) => {
  try {
    if (!(await userCanOperateLead(req, req.params.id))) {
      return res.status(403).json({
        success: false,
        message: "You can update only assigned leads",
      });
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      {
        $currentDate: { lastActivityAt: true },
        $push: {
          callLogs: {
            outcome: cleanOptional(req.body.outcome),
            notes: cleanOptional(req.body.notes),
            calledBy: req.user?._id || null,
            calledAt: req.body.calledAt || new Date(),
          },
        },
      },
      { new: true },
    );

    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found" });
    }

    return res.json({ success: true, message: "Call log added", data: enquiry });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const sendLeadEmails = async (req, res) => {
  try {
    const leadIds = Array.isArray(req.body.leadIds) ? req.body.leadIds : [];
    const templateId = req.body.templateId;

    if (!leadIds.length) {
      return res.status(400).json({ success: false, message: "leadIds are required" });
    }

    let template = {
      subject: req.body.subject,
      body: req.body.body,
    };

    if (templateId) {
      const templateFilter = {
        _id: templateId,
        ...(req.user?.role === "super_admin"
          ? {
              $or: [
                { templateType: "system" },
                { createdBy: req.user?._id || null },
              ],
            }
          : {
              templateType: { $ne: "system" },
              createdBy: req.user?._id || null,
            }),
      };

      template = await LeadEmailTemplate.findOne(templateFilter).lean();

      if (!template) {
        const centralFilter = {
          _id: templateId,
          isActive: true,
        };
        if (req.user?.role === "super_admin") {
          centralFilter.$or = [
            { isSystem: true },
            { createdBy: req.user?._id || null },
          ];
        } else {
          centralFilter.isSystem = { $ne: true };
          centralFilter.createdBy = req.user?._id || null;
        }
        const centralTemplate = await EmailTemplate.findOne(centralFilter).lean();
        if (centralTemplate) {
          template = {
            ...centralTemplate,
            body: centralTemplate.html,
          };
        }
      }
    }

    if (!template?.subject || !template?.body) {
      return res.status(400).json({ success: false, message: "Email template is required" });
    }

    const leads = await Enquiry.find(
      mergeFilters(
        { _id: { $in: leadIds } },
        req.user?.role === "consultant"
          ? {}
          : await buildLeadAccessFilter(req),
      ),
    )
      .populate("consultantId", "name")
      .lean();

    let permittedLeads = leads;
    if (req.user?.role === "consultant") {
      const consultant = await getConsultantForUser(req.user._id);
      permittedLeads = leads.filter(
        (lead) => String(lead.consultantId?._id || lead.consultantId || "") === String(consultant?._id || ""),
      );
    }

    const results = [];

    for (const lead of permittedLeads) {
      const subject = renderLeadTemplate(template.subject, lead);
      const body = renderLeadTemplate(template.body, lead);
      let status = "sent";
      let error = "";

      try {
        await sendEmailWithFallback({
          to: lead.email,
          subject,
          html: body,
        });
      } catch (err) {
        status = "failed";
        error = err.message;
      }

      await Enquiry.findByIdAndUpdate(lead._id, {
        $currentDate: { lastActivityAt: true },
        $push: {
          emailLogs: {
            templateId: templateId || null,
            subject,
            status,
            error,
            sentBy: req.user?._id || null,
            sentAt: new Date(),
          },
        },
      });

      results.push({ leadId: lead._id, email: lead.email, status, error });
    }

    return res.json({
      success: true,
      message: "Bulk email operation completed",
      data: results,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// Super admin only: delete enquiry
export const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await Enquiry.findByIdAndDelete(req.params.id);

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    return res.json({
      success: true,
      message: "Enquiry deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
