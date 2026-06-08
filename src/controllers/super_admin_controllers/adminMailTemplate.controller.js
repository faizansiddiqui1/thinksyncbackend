import EmailTemplate from "../../models/super_admin_models/EmailTemplate.js";
import {
  buildSampleVariables,
  extractTemplateVariables,
  ensureDefaultEmailTemplates,
  getTemplateMetaPayload,
  SYSTEM_EMAIL_TEMPLATE_DEFINITIONS,
  validateAndNormalizeTemplatePayload,
} from "../../services/emailTemplateRegistry.service.js";
import {
  previewEmailTemplate,
  sendEmail,
} from "../../services/mail.service.js";

const OWNER_VARIABLES = new Set([
  "userName",
  "companyName",
  "workspaceName",
  "workspaceAddress",
  "workspaceType",
  "bookingId",
  "bookingDate",
  "bookingStatus",
  "bookingStart",
  "bookingEnd",
  "startTime",
  "endTime",
  "duration",
  "tourDate",
  "paymentAmount",
  "manageBookingLink",
  "dashboardLink",
  "platformName",
  "supportEmail",
  "year",
]);

const CONSULTANT_VARIABLES = new Set([
  "leadName",
  "leadCity",
  "leadProduct",
  "leadListingMode",
  "companyName",
  "workspaceName",
  "consultantName",
  "enquiryId",
  "enquiryService",
  "dashboardLink",
  "platformName",
  "supportEmail",
  "year",
]);

function getRoleKey(req) {
  if (req.user?.role === "super_admin") return "super_admin";
  if (req.user?.role === "consultant") return "consultant";
  if (req.user?.companyId) return "company_admin";
  return "admin";
}

function mergeQueryFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length);
  if (!active.length) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

function getAccessibleTemplateFilter(req) {
  if (req.user?.role === "super_admin") {
    return {
      $or: [
        { isSystem: true },
        { createdBy: req.user?._id || null },
      ],
    };
  }

  return {
    isSystem: { $ne: true },
    createdBy: req.user?._id || null,
  };
}

function canEditTemplate(req, template) {
  if (req.user?.role === "super_admin") return true;
  if (template?.isSystem) return false;
  return String(template?.createdBy || "") === String(req.user?._id || "");
}

function filterMetaForRole(meta, role) {
  if (role === "super_admin") return meta;
  const allowed = role === "consultant" ? CONSULTANT_VARIABLES : OWNER_VARIABLES;

  return {
    ...meta,
    defaultTemplates: [],
    variables: (meta.variables || []).filter((variable) => allowed.has(variable.key)),
  };
}

async function getUniquePrivateTemplateName(baseName, userId) {
  const suffix = String(userId || Date.now()).slice(-6);
  let candidate = `${baseName}_${suffix}`;
  let counter = 2;

  while (await EmailTemplate.exists({ name: candidate })) {
    candidate = `${baseName}_${suffix}_${counter}`;
    counter += 1;
  }

  return candidate;
}

function normalizePagination(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 12), 100);
  return { page, limit };
}

function toRegexSearch(value = "") {
  const search = String(value || "").trim();
  return search ? new RegExp(search, "i") : null;
}

function normalizeTemplateDocument(doc, req = null) {
  if (!doc) return null;

  return {
    ...doc,
    previewVariables: buildSampleVariables(doc.allowedVariables || []),
    canEdit: req ? canEditTemplate(req, doc) : false,
  };
}

export async function getMailTemplateMeta(req, res) {
  try {
    const data = filterMetaForRole(
      await getTemplateMetaPayload(),
      getRoleKey(req),
    );

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function listMailTemplates(req, res) {
  try {
    await ensureDefaultEmailTemplates();

    const { page, limit } = normalizePagination(req.query);
    const searchRegex = toRegexSearch(req.query.search);
    const query = {};

    if (req.query.status === "active") {
      query.isActive = true;
    }

    if (req.query.status === "inactive") {
      query.isActive = false;
    }

    if (searchRegex) {
      query.$or = [
        { name: searchRegex },
        { displayName: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ];
    }

    const skip = (page - 1) * limit;

    const finalQuery = mergeQueryFilters(
      query,
      getAccessibleTemplateFilter(req),
    );

    const [items, total] = await Promise.all([
      EmailTemplate.find(finalQuery)
        .sort({ isSystem: -1, updatedAt: -1, displayName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailTemplate.countDocuments(finalQuery),
    ]);

    return res.json({
      success: true,
      data: {
        templates: items.map((item) => normalizeTemplateDocument(item, req)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMailTemplateById(req, res) {
  try {
    await ensureDefaultEmailTemplates();

    const template = await EmailTemplate.findOne(
      mergeQueryFilters(
        { _id: req.params.id },
        getAccessibleTemplateFilter(req),
      ),
    ).lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    return res.json({
      success: true,
      data: normalizeTemplateDocument(template, req),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createMailTemplate(req, res) {
  try {
    const payload = validateAndNormalizeTemplatePayload(req.body);
    if (req.user?.role !== "super_admin") {
      payload.name = await getUniquePrivateTemplateName(
        payload.name,
        req.user?._id,
      );
    }

    const created = await EmailTemplate.create({
      ...payload,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      isSystem: false,
      visibility:
        req.user?.role === "super_admin" && req.body?.visibility === "shared"
          ? "shared"
          : "private",
      ownerRole: getRoleKey(req),
    });

    return res.status(201).json({
      success: true,
      data: normalizeTemplateDocument(created.toObject(), req),
    });
  } catch (error) {
    const status = error?.code === 11000 ? 409 : 400;
    return res.status(status).json({
      success: false,
      message:
        error?.code === 11000
          ? "Template name already exists"
          : error.message,
    });
  }
}

export async function updateMailTemplate(req, res) {
  try {
    const payload = validateAndNormalizeTemplatePayload(req.body);

    const template = await EmailTemplate.findOne(
      mergeQueryFilters(
        { _id: req.params.id },
        getAccessibleTemplateFilter(req),
      ),
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    if (!canEditTemplate(req, template)) {
      return res.status(403).json({
        success: false,
        message: "You can edit only your own custom templates",
      });
    }

    template.name = payload.name;
    template.displayName = payload.displayName;
    template.description = payload.description;
    template.category = payload.category;
    template.subject = payload.subject;
    template.html = payload.html;
    template.isActive = payload.isActive;
    template.allowedVariables = payload.allowedVariables;
    template.updatedBy = req.user?._id || null;

    await template.save();

    return res.json({
      success: true,
      data: normalizeTemplateDocument(template.toObject(), req),
    });
  } catch (error) {
    const status = error?.code === 11000 ? 409 : 400;
    return res.status(status).json({
      success: false,
      message:
        error?.code === 11000
          ? "Template name already exists"
          : error.message,
    });
  }
}

export async function toggleMailTemplateStatus(req, res) {
  try {
    const template = await EmailTemplate.findOne(
      mergeQueryFilters(
        { _id: req.params.id },
        getAccessibleTemplateFilter(req),
      ),
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    if (!canEditTemplate(req, template)) {
      return res.status(403).json({
        success: false,
        message: "System and shared templates are read-only",
      });
    }

    template.isActive =
      typeof req.body?.isActive === "boolean"
        ? req.body.isActive
        : !template.isActive;
    template.updatedBy = req.user?._id || null;

    await template.save();

    return res.json({
      success: true,
      data: normalizeTemplateDocument(template.toObject(), req),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteMailTemplate(req, res) {
  try {
    const template = await EmailTemplate.findOne(
      mergeQueryFilters(
        { _id: req.params.id },
        getAccessibleTemplateFilter(req),
      ),
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    if (!canEditTemplate(req, template)) {
      return res.status(400).json({
        success: false,
        message: "You can delete only your own custom templates",
      });
    }

    await template.deleteOne();

    return res.json({
      success: true,
      message: "Email template deleted successfully",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function previewMailTemplate(req, res) {
  try {
    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "");
    const variablesUsed = extractTemplateVariables(subject, html);
    const sampleVariables = buildSampleVariables(variablesUsed);

    const rendered = await previewEmailTemplate({
      subject,
      html,
      variables: {
        ...sampleVariables,
        ...(req.body?.variables || {}),
      },
    });

    return res.json({
      success: true,
      data: {
        ...rendered,
        variables: {
          ...sampleVariables,
          ...(req.body?.variables || {}),
        },
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function restoreMailTemplateDefault(req, res) {
  try {
    if (req.user?.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only super admins can restore system templates",
      });
    }
    const template = await EmailTemplate.findById(req.params.id);

    if (!template || !template.isSystem) {
      return res.status(404).json({
        success: false,
        message: "System email template not found",
      });
    }

    const definition = SYSTEM_EMAIL_TEMPLATE_DEFINITIONS.find(
      (item) => item.name === template.name,
    );

    if (!definition) {
      return res.status(400).json({
        success: false,
        message: "Default template definition is not registered",
      });
    }

    const payload = validateAndNormalizeTemplatePayload(definition);

    Object.assign(template, payload, {
      isSystem: true,
      updatedBy: req.user?._id || null,
    });

    await template.save();

    return res.json({
      success: true,
      data: normalizeTemplateDocument(template.toObject(), req),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function sendTestMailTemplate(req, res) {
  try {
    const to = String(req.body?.to || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").trim();
    const html = String(req.body?.html || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({
        success: false,
        message: "A valid test recipient email is required",
      });
    }

    const variablesUsed = extractTemplateVariables(subject, html);
    const variables = {
      ...buildSampleVariables(variablesUsed),
      ...(req.body?.variables || {}),
    };
    const rendered = await previewEmailTemplate({
      subject,
      html,
      variables,
    });

    await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      queue: false,
    });

    return res.json({
      success: true,
      message: `Test email sent to ${to}`,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}
