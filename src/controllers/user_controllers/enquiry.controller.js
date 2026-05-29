// controllers/enquiry.controller.js
import mongoose from "mongoose";

import Enquiry from "../../models/user_models/Enquiry.js";
import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Consultant from "../../models/super_admin_models/Consultant.js";
import LeadEmailTemplate from "../../models/super_admin_models/LeadEmailTemplate.js";
import sendEmailWithFallback from "../../utils/sendEmailWithFallback.js";
import {
  findMatchingConsultant,
  getConsultantForUser,
} from "../../services/consultantRouting.service.js";

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

const cleanUtm = (value = {}) => ({
  source: cleanOptional(value.source || value.utm_source),
  medium: cleanOptional(value.medium || value.utm_medium),
  campaign: cleanOptional(value.campaign || value.utm_campaign),
  term: cleanOptional(value.term || value.utm_term),
  content: cleanOptional(value.content || value.utm_content),
});

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
  };

  return String(template || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    return values[key] ?? "";
  });
};

const buildLeadRoutingPayload = async (req, body = {}) => {
  const listingId = body.listingId || body.spaceId || null;

  const routed = await findMatchingConsultant(
    {
      ...body,
      listingId,
      spaceId: body.spaceId || listingId,
      listingSlug: body.listingSlug,
      city: body.city,
      product: body.product || body.productType,
      spaceType: body.spaceType || body.listingType,
      pageType: body.pageType,
      sourceUrl: body.sourceUrl,
    },
    { publicView: false },
  );

  const consultantDoc = routed.consultantDoc || null;
  const context = routed.context || {};

  return {
    consultantId: consultantDoc?._id || body.consultantId || null,
    listingId: context.listing?._id || listingId || null,
    listingName: cleanOptional(
      context.listing?.name || body.listingName || body.listingTitle || body.spaceName,
    ),
    listingSlug: cleanOptional(context.listing?.slug || body.listingSlug),
    city: cleanOptional(context.cityName || body.cityName || body.city),
    product: cleanOptional(context.productType || body.product || body.productType),
    spaceType: cleanOptional(context.spaceType || body.spaceType || body.listingType),
    pageType: cleanOptional(context.pageType || body.pageType || body.sourcePage),
    sourceUrl: cleanOptional(context.sourceUrl || body.sourceUrl || body.sourceURL),
    utm: cleanUtm(body.utm || body),
    device: getRequestDevice(req, body.device || {}),
    assignmentHistory: consultantDoc?._id
      ? [
          {
            consultant: consultantDoc._id,
            previousConsultant: null,
            assignedBy: null,
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
    leadSource: body.leadSource || "website",
    priority: body.priority || "medium",
    status: "new",
  };
}

async function userCanOperateLead(req, leadId) {
  if (req.user?.role === "super_admin") return true;
  if (req.user?.role !== "consultant") return false;

  const consultant = await getConsultantForUser(req.user._id);
  if (!consultant?._id) return false;

  const lead = await Enquiry.findById(leadId).select("consultantId").lean();
  return Boolean(lead && String(lead.consultantId || "") === String(consultant._id));
}

// Public create enquiry
export const createEnquiry = async (req, res) => {
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

    const leadRoutingPayload = await buildLeadRoutingPayload(req, req.body || {});

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

      return res.status(201).json({
        success: true,
        message: "Enquiry created successfully",
        data: enquiry,
      });
    }

    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "name, email and phoneNumber are required",
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

    return res.status(201).json({
      success: true,
      message: "Enquiry created successfully",
      data: enquiry,
    });
  } catch (err) {
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
    const filter = buildLeadFilter(req.query);
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Enquiry.find(filter)
        .populate("submittedByUser", "email username phoneNumber role isActive")
        .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
        .populate("consultantId", "name email phone designation profileImage")
        .populate("spaceId", "title name spaceType location slug")
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
    const enquiry = await Enquiry.findById(req.params.id)
      .populate("submittedByUser", "email username phoneNumber role isActive")
      .populate("submittedByAdminProfile", "company.name company.address whiteLabel.status")
      .populate("consultantId", "name email phone designation profileImage")
      .populate("spaceId", "title name spaceType location slug")
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
      reason,
      assignedAt: new Date(),
    });
    existing.consultantId = consultant._id;

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
      const templateFilter = { _id: templateId };

      if (req.user?.role === "consultant") {
        templateFilter.$or = [
          { visibility: "shared", isActive: true },
          { createdBy: req.user._id, visibility: "consultant" },
        ];
      }

      template = await LeadEmailTemplate.findOne(templateFilter).lean();
    }

    if (!template?.subject || !template?.body) {
      return res.status(400).json({ success: false, message: "Email template is required" });
    }

    const leads = await Enquiry.find({ _id: { $in: leadIds } })
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
