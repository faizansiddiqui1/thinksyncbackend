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

function normalizePagination(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 12), 100);
  return { page, limit };
}

function toRegexSearch(value = "") {
  const search = String(value || "").trim();
  return search ? new RegExp(search, "i") : null;
}

function normalizeTemplateDocument(doc) {
  if (!doc) return null;

  return {
    ...doc,
    previewVariables: buildSampleVariables(doc.allowedVariables || []),
  };
}

export async function getMailTemplateMeta(req, res) {
  try {
    const data = await getTemplateMetaPayload();

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

    const [items, total] = await Promise.all([
      EmailTemplate.find(query)
        .sort({ isSystem: -1, updatedAt: -1, displayName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailTemplate.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: {
        templates: items.map(normalizeTemplateDocument),
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

    const template = await EmailTemplate.findById(req.params.id).lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    return res.json({
      success: true,
      data: normalizeTemplateDocument(template),
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

    const created = await EmailTemplate.create({
      ...payload,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
      isSystem: false,
    });

    return res.status(201).json({
      success: true,
      data: normalizeTemplateDocument(created.toObject()),
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

    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
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
      data: normalizeTemplateDocument(template.toObject()),
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
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
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
      data: normalizeTemplateDocument(template.toObject()),
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
    const template = await EmailTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }

    if (template.isSystem) {
      return res.status(400).json({
        success: false,
        message: "System templates cannot be deleted",
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
      data: normalizeTemplateDocument(template.toObject()),
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
