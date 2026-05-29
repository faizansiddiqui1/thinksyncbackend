import mongoose from "mongoose";

import Consultant, {
  dropLegacyConsultantParallelArrayIndexes,
} from "../../models/super_admin_models/Consultant.js";
import ConsultantEditRequest from "../../models/super_admin_models/ConsultantEditRequest.js";
import LeadEmailTemplate from "../../models/super_admin_models/LeadEmailTemplate.js";
import Enquiry from "../../models/user_models/Enquiry.js";
import User from "../../models/user_models/User.js";
import {
  findMatchingConsultant,
  getConsultantForUser,
  serializeConsultant,
} from "../../services/consultantRouting.service.js";
import { normalizePhone } from "../../utils/phoneUtils.js";

const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "follow-up",
  "qualified",
  "closed",
  "lost",
];

const IN_PROGRESS_STATUSES = ["contacted", "interested", "follow-up", "qualified"];
const CLOSED_STATUSES = ["closed", "converted"];
const TEMPLATE_CATEGORIES = new Set([
  "booking",
  "follow_up",
  "consultant",
  "lead_nurture",
  "review_request",
  "custom",
]);

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanArray(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function cleanTemplateCategory(value) {
  const key = cleanText(value, "consultant").toLowerCase().replace(/[\s-]+/g, "_");
  return TEMPLATE_CATEGORIES.has(key) ? key : "consultant";
}

function isSameId(left, right) {
  return String(left || "") === String(right || "");
}

function getUserObjectId(userId) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) return null;
  return new mongoose.Types.ObjectId(String(userId));
}

function getAccessibleTemplateFilter(req, { activeOnly = false } = {}) {
  const filter = {};
  const isSuperAdmin = req.user?.role === "super_admin";

  if (activeOnly) filter.isActive = true;

  if (!isSuperAdmin) {
    filter.$or = [
      { visibility: "shared", isActive: true },
      { createdBy: req.user?._id || null, visibility: "consultant" },
    ];
  }

  return filter;
}

function normalizeLeadTemplatePayload(body = {}, req = {}) {
  const name = cleanText(body.name);
  const subject = cleanText(body.subject);
  const bodyText = cleanText(body.body);

  if (!name || !subject || !bodyText) {
    const error = new Error("Template name, subject and body are required");
    error.status = 400;
    throw error;
  }

  const isSuperAdmin = req.user?.role === "super_admin";
  const visibility = isSuperAdmin
    ? cleanText(body.visibility, "shared")
    : "consultant";

  return {
    name,
    subject,
    body: bodyText,
    category: cleanTemplateCategory(body.category),
    visibility: ["super_admin", "consultant", "shared"].includes(visibility)
      ? visibility
      : "shared",
    templateType:
      isSuperAdmin && body.templateType === "system" ? "system" : "custom",
    isActive: body.isActive !== false,
    updatedBy: req.user?._id || null,
  };
}

function summarizeLeadActivity(leads = []) {
  const events = [];

  leads.forEach((lead) => {
    events.push({
      type: "lead",
      title: "Lead received",
      description: `${lead.name || "Lead"}${lead.listingName ? ` for ${lead.listingName}` : ""}`,
      leadId: lead._id,
      leadName: lead.name,
      at: lead.createdAt,
    });

    if (lead.status) {
      events.push({
        type: "status",
        title: `Status: ${lead.status}`,
        description: `${lead.name || "Lead"} is currently marked ${lead.status}`,
        leadId: lead._id,
        leadName: lead.name,
        at: lead.updatedAt || lead.createdAt,
      });
    }

    (lead.leadNotes || []).forEach((note) => {
      events.push({
        type: "note",
        title: "Note added",
        description: note.note || "",
        leadId: lead._id,
        leadName: lead.name,
        at: note.createdAt,
      });
    });

    (lead.callLogs || []).forEach((call) => {
      events.push({
        type: "call",
        title: call.outcome ? `Call: ${call.outcome}` : "Call logged",
        description: call.notes || "",
        leadId: lead._id,
        leadName: lead.name,
        at: call.calledAt,
      });
    });

    (lead.emailLogs || []).forEach((email) => {
      events.push({
        type: "email",
        title: email.status === "failed" ? "Email failed" : "Email sent",
        description: email.subject || "",
        leadId: lead._id,
        leadName: lead.name,
        at: email.sentAt,
        status: email.status,
      });
    });
  });

  return events
    .filter((event) => event.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
}

function normalizeConsultantPayload(body = {}, userId = null) {
  const profileImage = body.profileImage || {};
  const profileImageUrl = body.profileImageUrl || profileImage.url || "";
  const profileImageKey = body.profileImageKey || profileImage.key || "";

  const payload = {
    name: cleanText(body.name),
    phone: cleanText(body.phone),
    email: cleanText(body.email).toLowerCase(),
    designation: cleanText(body.designation, "Workspace Consultant"),
    profileImage: {
      url: cleanText(profileImageUrl),
      key: cleanText(profileImageKey),
    },
    isActive:
      body.isActive === undefined && body.active === undefined
        ? true
        : body.isActive === true || body.active === true || body.isActive === "true",
    assignedCities: cleanArray(body.assignedCities || body.cities),
    assignedProductTypes: cleanArray(body.assignedProductTypes || body.productTypes),
    assignedSpaceTypes: cleanArray(body.assignedSpaceTypes || body.spaceTypes),
    priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 100,
    notes: cleanText(body.notes),
    visibilityRules: {
      ...(body.visibilityRules || {}),
      listingIds: cleanArray(body.visibilityRules?.listingIds || body.listingIds).filter((id) =>
        mongoose.Types.ObjectId.isValid(String(id)),
      ),
      cityFallback:
        body.visibilityRules?.cityFallback === true || body.cityFallback === true,
      globalFallback:
        body.visibilityRules?.globalFallback === true || body.globalFallback === true,
      hiddenFromPublic:
        body.visibilityRules?.hiddenFromPublic === true ||
        body.hiddenFromPublic === true,
    },
    sourceOfMapping: cleanText(body.sourceOfMapping, "manual_admin"),
    linkedUser: body.linkedUser && mongoose.Types.ObjectId.isValid(String(body.linkedUser))
      ? body.linkedUser
      : null,
    updatedBy: userId || null,
  };

  if (!payload.name || !payload.phone || !payload.email) {
    const error = new Error("name, phone and email are required");
    error.status = 400;
    throw error;
  }

  return payload;
}

async function ensureConsultantLoginUser(payload) {
  if (payload.linkedUser) return payload.linkedUser;

  const clauses = [];
  if (payload.email) clauses.push({ email: payload.email });
  const phoneNumber = normalizePhone(payload.phone);
  if (phoneNumber) clauses.push({ phoneNumber });
  if (!clauses.length) return null;

  let user = await User.findOne({ $or: clauses });

  if (!user) {
    const baseUsername =
      cleanText(payload.email).split("@")[0] ||
      cleanText(payload.name).toLowerCase().replace(/[^a-z0-9]+/g, "_") ||
      "consultant";

    user = await User.create({
      email: payload.email || undefined,
      phoneNumber: phoneNumber || undefined,
      username: `${baseUsername}_${Date.now().toString(36)}`.slice(0, 20),
      role: "consultant",
      isActive: true,
    });
  } else if (user.role === "user") {
    user.role = "consultant";
    user.isActive = true;
    await user.save();
  }

  return user._id;
}

function normalizeLeadFilter(query = {}, user = null, consultant = null) {
  const filter = {};

  if (consultant?._id) {
    filter.consultantId = consultant._id;
  } else if (query.consultantId && mongoose.Types.ObjectId.isValid(String(query.consultantId))) {
    filter.consultantId = new mongoose.Types.ObjectId(String(query.consultantId));
  }

  if (query.status) filter.status = query.status;
  if (query.city) filter.city = { $regex: String(query.city), $options: "i" };
  if (query.product) filter.product = String(query.product);
  if (query.source) filter.source = query.source;

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

function renderTemplate(template = "", lead = {}) {
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
  };

  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    return values[key] ?? "";
  });
}

export const getAssignedConsultant = async (req, res) => {
  try {
    const { consultant, context, match } = await findMatchingConsultant(req.query, {
      publicView: true,
    });

    return res.json({
      success: true,
      data: {
        consultant,
        context,
        match,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listConsultants = async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === "true") filter.isActive = true;
    if (req.query.active === "false") filter.isActive = false;

    if (req.query.q) {
      const q = String(req.query.q).trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { designation: { $regex: q, $options: "i" } },
      ];
    }

    const consultants = await Consultant.find(filter)
      .populate("assignedCities", "name slug state")
      .populate("linkedUser", "email phoneNumber username role isActive")
      .sort({ priority: 1, createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: consultants.map((item) =>
        serializeConsultant(item, { publicView: false }),
      ),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createConsultant = async (req, res) => {
  try {
    await dropLegacyConsultantParallelArrayIndexes();
    const payload = normalizeConsultantPayload(req.body, req.user?._id);
    payload.linkedUser = await ensureConsultantLoginUser(payload);
    payload.createdBy = req.user?._id || null;

    const consultant = await Consultant.create(payload);
    const populated = await Consultant.findById(consultant._id)
      .populate("assignedCities", "name slug state")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Consultant created successfully",
      data: serializeConsultant(populated, { publicView: false }),
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      message: err.message,
    });
  }
};

export const updateConsultant = async (req, res) => {
  try {
    await dropLegacyConsultantParallelArrayIndexes();
    const payload = normalizeConsultantPayload(req.body, req.user?._id);
    payload.linkedUser = await ensureConsultantLoginUser(payload);

    const consultant = await Consultant.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    })
      .populate("assignedCities", "name slug state")
      .lean();

    if (!consultant) {
      return res.status(404).json({ success: false, message: "Consultant not found" });
    }

    return res.json({
      success: true,
      message: "Consultant updated successfully",
      data: serializeConsultant(consultant, { publicView: false }),
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      message: err.message,
    });
  }
};

export const deleteConsultantProfileImage = async (req, res) => {
  try {
    const consultant = await Consultant.findByIdAndUpdate(
      req.params.id,
      {
        profileImage: { url: "", key: "" },
        updatedBy: req.user?._id || null,
      },
      { new: true },
    ).lean();

    if (!consultant) {
      return res.status(404).json({ success: false, message: "Consultant not found" });
    }

    return res.json({
      success: true,
      message: "Profile image removed",
      data: serializeConsultant(consultant, { publicView: false }),
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const reorderConsultants = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    await Promise.all(
      items
        .filter((item) => mongoose.Types.ObjectId.isValid(String(item.id)))
        .map((item) =>
          Consultant.findByIdAndUpdate(item.id, {
            priority: Number(item.priority || 100),
            updatedBy: req.user?._id || null,
          }),
        ),
    );

    return res.json({ success: true, message: "Consultant priority updated" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const requestConsultantProfileEdit = async (req, res) => {
  try {
    const consultant = await getConsultantForUser(req.user?._id);
    if (!consultant) {
      return res.status(404).json({
        success: false,
        message: "Consultant profile not linked to this login",
      });
    }

    const allowedChanges = {};
    [
      "name",
      "phone",
      "email",
      "designation",
      "profileImage",
      "notes",
      "publicProfile",
    ].forEach((key) => {
      if (req.body[key] !== undefined) allowedChanges[key] = req.body[key];
    });

    if (!Object.keys(allowedChanges).length) {
      return res.status(400).json({ success: false, message: "No editable changes submitted" });
    }

    const request = await ConsultantEditRequest.create({
      consultant: consultant._id,
      requestedBy: req.user._id,
      changes: allowedChanges,
    });

    await Consultant.findByIdAndUpdate(consultant._id, {
      requestApprovalStatus: "pending",
    });

    return res.status(201).json({
      success: true,
      message: "Profile edit request sent for approval",
      data: request,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const listConsultantEditRequests = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const requests = await ConsultantEditRequest.find(filter)
      .populate("consultant", "name email phone designation profileImage")
      .populate("requestedBy", "email username phoneNumber role")
      .populate("reviewedBy", "email username")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const reviewConsultantEditRequest = async (req, res) => {
  try {
    const status = req.body.status || req.params.action;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid review status" });
    }

    const request = await ConsultantEditRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Edit request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: "Request already reviewed" });
    }

    request.status = status;
    request.reviewNotes = cleanText(req.body.reviewNotes);
    request.reviewedBy = req.user?._id || null;
    request.reviewedAt = new Date();

    if (status === "approved") {
      await Consultant.findByIdAndUpdate(request.consultant, {
        ...request.changes,
        requestApprovalStatus: "approved",
        updatedBy: req.user?._id || null,
      });
    } else {
      await Consultant.findByIdAndUpdate(request.consultant, {
        requestApprovalStatus: "rejected",
        updatedBy: req.user?._id || null,
      });
    }

    await request.save();

    return res.json({
      success: true,
      message: `Edit request ${status}`,
      data: request,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getLeadDistribution = async (req, res) => {
  try {
    const baseFilter = normalizeLeadFilter(req.query);

    const [byConsultant, byCity, byProduct, byStatus, recentLeads] = await Promise.all([
      Enquiry.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$consultantId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Enquiry.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$city", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Enquiry.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$product", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Enquiry.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Enquiry.find(baseFilter)
        .populate("consultantId", "name email phone designation")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        byConsultant,
        byCity,
        byProduct,
        byStatus,
        recentLeads,
        statuses: LEAD_STATUSES,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getConsultantDashboard = async (req, res) => {
  try {
    const consultant = await getConsultantForUser(req.user?._id);
    if (!consultant) {
      return res.status(404).json({
        success: false,
        message: "Consultant profile not linked to this login",
      });
    }

    const filter = { consultantId: consultant._id };
    const userObjectId = getUserObjectId(req.user?._id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      total,
      todayCount,
      weekCount,
      monthCount,
      byStatus,
      byCity,
      byProduct,
      followUps,
      recentLeads,
      recentFollowUps,
      activityLeads,
      emailStats,
      activeTemplates,
    ] = await Promise.all([
      Enquiry.countDocuments(filter),
      Enquiry.countDocuments({ ...filter, createdAt: { $gte: todayStart } }),
      Enquiry.countDocuments({ ...filter, createdAt: { $gte: weekStart } }),
      Enquiry.countDocuments({ ...filter, createdAt: { $gte: monthStart } }),
      Enquiry.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Enquiry.aggregate([
        { $match: filter },
        { $group: { _id: "$city", count: { $sum: 1 } } },
      ]),
      Enquiry.aggregate([
        { $match: filter },
        { $group: { _id: "$product", count: { $sum: 1 } } },
      ]),
      Enquiry.find({ ...filter, status: "follow-up" })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      Enquiry.find(filter)
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Enquiry.find({ ...filter, status: "follow-up" })
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),
      Enquiry.find(filter)
        .select("name listingName city product status createdAt updatedAt leadNotes callLogs emailLogs")
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
      Enquiry.aggregate([
        { $match: filter },
        { $unwind: "$emailLogs" },
        ...(userObjectId ? [{ $match: { "emailLogs.sentBy": userObjectId } }] : []),
        {
          $group: {
            _id: "$emailLogs.status",
            count: { $sum: 1 },
            lastSentAt: { $max: "$emailLogs.sentAt" },
          },
        },
      ]),
      LeadEmailTemplate.countDocuments(getAccessibleTemplateFilter(req, { activeOnly: true })),
    ]);

    const statusCounts = new Map(byStatus.map((item) => [item._id, Number(item.count || 0)]));
    const closed = CLOSED_STATUSES.reduce((sum, key) => sum + (statusCounts.get(key) || 0), 0);
    const inProgress = IN_PROGRESS_STATUSES.reduce(
      (sum, key) => sum + (statusCounts.get(key) || 0),
      0,
    );
    const emailsSent = emailStats.reduce((sum, item) => {
      if (item._id === "failed") return sum;
      return sum + Number(item.count || 0);
    }, 0);
    const conversionRate = total ? Number(((closed / total) * 100).toFixed(1)) : 0;
    const recentEmails = activityLeads
      .flatMap((lead) =>
        (lead.emailLogs || []).map((email) => ({
          leadId: lead._id,
          leadName: lead.name,
          listingName: lead.listingName,
          subject: email.subject,
          status: email.status,
          sentAt: email.sentAt,
          error: email.error,
        })),
      )
      .filter((item) => item.sentAt)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
      .slice(0, 8);

    return res.json({
      success: true,
      data: {
        consultant: serializeConsultant(consultant, { publicView: false }),
        total,
        today: todayCount,
        week: weekCount,
        month: monthCount,
        inProgress,
        closed,
        conversionRate,
        emailsSent,
        activeTemplates,
        byStatus,
        byCity,
        byProduct,
        followUps,
        recentLeads,
        recentFollowUps,
        recentEmails,
        activityTimeline: summarizeLeadActivity(activityLeads),
        emailStats,
        statuses: LEAD_STATUSES,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listConsultantLeads = async (req, res) => {
  try {
    const consultant = await getConsultantForUser(req.user?._id);
    if (!consultant) {
      return res.status(404).json({
        success: false,
        message: "Consultant profile not linked to this login",
      });
    }

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const filter = normalizeLeadFilter(req.query, req.user, consultant);

    const [items, total] = await Promise.all([
      Enquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Enquiry.countDocuments(filter),
    ]);

    return res.json({ success: true, data: items, total, page, limit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const listLeadEmailTemplates = async (req, res) => {
  try {
    const filter = getAccessibleTemplateFilter(req, {
      activeOnly: req.query.active === "true",
    });

    if (req.query.category) {
      filter.category = cleanTemplateCategory(req.query.category);
    }

    if (req.query.templateType) {
      filter.templateType = req.query.templateType === "system" ? "system" : "custom";
    }

    const templates = await LeadEmailTemplate.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createLeadEmailTemplate = async (req, res) => {
  try {
    const payload = normalizeLeadTemplatePayload(req.body, req);
    const template = await LeadEmailTemplate.create({
      ...payload,
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({ success: true, data: template });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
};

export const updateLeadEmailTemplate = async (req, res) => {
  try {
    const existing = await LeadEmailTemplate.findById(req.params.id);

    if (!existing) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const payload = normalizeLeadTemplatePayload(req.body, req);

    if (req.user?.role !== "super_admin") {
      const ownsTemplate =
        isSameId(existing.createdBy, req.user?._id) &&
        existing.visibility === "consultant";

      if (!ownsTemplate) {
        const cloned = await LeadEmailTemplate.create({
          ...payload,
          visibility: "consultant",
          templateType: "custom",
          sourceTemplate: existing._id,
          createdBy: req.user?._id || null,
          updatedBy: req.user?._id || null,
        });

        return res.status(201).json({
          success: true,
          message: "Custom template copy created",
          data: cloned,
        });
      }
    }

    Object.assign(existing, payload);
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
};

export const deleteLeadEmailTemplate = async (req, res) => {
  try {
    const template = await LeadEmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    if (
      req.user?.role !== "super_admin" &&
      (!isSameId(template.createdBy, req.user?._id) || template.visibility !== "consultant")
    ) {
      return res.status(403).json({
        success: false,
        message: "You can delete only your own custom templates",
      });
    }

    await template.deleteOne();

    return res.json({ success: true, message: "Template deleted" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const previewLeadEmailTemplate = async (req, res) => {
  try {
    let lead = req.body.lead || {};

    if (req.body.leadId) {
      lead = await Enquiry.findById(req.body.leadId).populate("consultantId", "name").lean();

      if (!lead) {
        return res.status(404).json({ success: false, message: "Lead not found" });
      }

      if (req.user?.role === "consultant") {
        const consultant = await getConsultantForUser(req.user?._id);
        if (!consultant || !isSameId(lead.consultantId?._id || lead.consultantId, consultant._id)) {
          return res.status(403).json({
            success: false,
            message: "You can preview only assigned leads",
          });
        }
      }
    }

    return res.json({
      success: true,
      data: {
        subject: renderTemplate(req.body.subject || "", lead || {}),
        body: renderTemplate(req.body.body || "", lead || {}),
      },
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export { renderTemplate };
