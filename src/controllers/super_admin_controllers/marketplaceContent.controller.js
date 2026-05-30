import mongoose from "mongoose";

import MarketplaceContent, {
  createContentSlug,
} from "../../models/super_admin_models/MarketplaceContent.js";

const TYPE_ALIASES = {
  offer: "offers",
  offers: "offers",
  partner: "partners",
  partners: "partners",
  testimonial: "testimonials",
  testimonials: "testimonials",
  blog: "blogs",
  blogs: "blogs",
  page: "pages",
  pages: "pages",
};

function normalizeType(value = "") {
  return TYPE_ALIASES[String(value || "").trim().toLowerCase()] || "";
}

function parseLimit(value, fallback = 10) {
  return Math.min(Math.max(Number(value) || fallback, 1), 100);
}

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanImage(value = {}) {
  if (typeof value === "string") {
    return { url: cleanText(value), key: "", alt: "" };
  }

  return {
    url: cleanText(value?.url),
    key: cleanText(value?.key),
    alt: cleanText(value?.alt),
  };
}

function cleanArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function cleanSections(value) {
  const sections = cleanArray(value);
  return sections
    .map((section) => ({
      sectionType: cleanText(section?.sectionType || section?.type),
      title: cleanText(section?.title),
      subtitle: cleanText(section?.subtitle),
      content: cleanText(section?.content),
      imageUrl: cleanText(section?.imageUrl || section?.image),
      ctaLabel: cleanText(section?.ctaLabel),
      ctaHref: cleanText(section?.ctaHref),
      items: cleanArray(section?.items),
      settings:
        section?.settings && typeof section.settings === "object"
          ? section.settings
          : {},
    }))
    .filter((section) => section.sectionType);
}

function cleanSeo(value = {}) {
  return {
    title: cleanText(value?.title),
    description: cleanText(value?.description),
    keywords: cleanArray(value?.keywords).map((item) => cleanText(item)).filter(Boolean),
  };
}

function buildPayload(type, body = {}, userId = null) {
  const title = cleanText(body.title || body.name || body.partnerName || body.personName);

  if (!title) {
    const error = new Error("Title is required");
    error.status = 400;
    throw error;
  }

  const payload = {
    type,
    title,
    slug: createContentSlug(body.slug || title),
    subtitle: cleanText(body.subtitle),
    excerpt: cleanText(body.excerpt || body.description),
    content: cleanText(body.content || body.description),
    image: cleanImage(body.image || body.imageUrl),
    logo: cleanImage(body.logo || body.logoUrl),
    code: cleanText(body.code).toUpperCase(),
    discountType: cleanText(body.discountType),
    discountValue: cleanNumber(body.discountValue),
    minBookingAmount: cleanNumber(body.minBookingAmount),
    maxDiscountAmount:
      body.maxDiscountAmount === "" || body.maxDiscountAmount === undefined
        ? null
        : cleanNumber(body.maxDiscountAmount),
    validFrom: cleanDate(body.validFrom),
    validTill: cleanDate(body.validTill),
    firstBookingOnly: Boolean(body.firstBookingOnly),
    perUserUsageLimit: cleanNumber(body.perUserUsageLimit, 1),
    totalUsageLimit:
      body.totalUsageLimit === "" || body.totalUsageLimit === undefined
        ? null
        : cleanNumber(body.totalUsageLimit),
    partnerName: cleanText(body.partnerName || body.title),
    partnerUrl: cleanText(body.partnerUrl),
    personName: cleanText(body.personName || body.name || body.title),
    role: cleanText(body.role),
    company: cleanText(body.company),
    location: cleanText(body.location),
    rating: Math.min(Math.max(cleanNumber(body.rating, 5), 0), 5),
    author: cleanText(body.author),
    category: cleanText(body.category),
    readTime: cleanText(body.readTime),
    ctaLabel: cleanText(body.ctaLabel),
    ctaHref: cleanText(body.ctaHref),
    sections: cleanSections(body.sections),
    seo: cleanSeo(body.seo),
    metadata:
      body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    priority: cleanNumber(body.priority, 100),
    isActive: body.isActive !== false,
    publishedAt: cleanDate(body.publishedAt),
    updatedBy: userId,
  };

  if (type !== "offers") {
    payload.discountType = "";
  } else if (!["percentage", "flat", "special"].includes(payload.discountType)) {
    payload.discountType = "percentage";
  }

  return payload;
}

function publicFilter(type) {
  const filter = {
    type,
    isActive: true,
    deletedAt: null,
  };

  if (type === "offers") {
    const now = new Date();
    filter.$and = [
      {
        $or: [{ validFrom: null }, { validFrom: { $lte: now } }],
      },
      {
        $or: [{ validTill: null }, { validTill: { $gte: now } }],
      },
    ];
  }

  return filter;
}

export async function listPublicContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    if (!type) return res.status(404).json({ success: false, message: "Unknown content type" });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = parseLimit(req.query.limit, 10);
    const skip = (page - 1) * limit;
    const filter = publicFilter(type);

    const [items, total] = await Promise.all([
      MarketplaceContent.find(filter)
        .sort({ priority: 1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MarketplaceContent.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getPublicContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    const slug = createContentSlug(req.params.slug);
    if (!type || !slug) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const item = await MarketplaceContent.findOne({
      ...publicFilter(type),
      slug,
    }).lean();

    if (!item) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    return res.json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function listAdminContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    if (!type) return res.status(404).json({ success: false, message: "Unknown content type" });

    const filter = { type, deletedAt: null };
    if (req.query.active === "true") filter.isActive = true;
    if (req.query.active === "false") filter.isActive = false;

    if (req.query.q) {
      const q = String(req.query.q).trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ];
    }

    const items = await MarketplaceContent.find(filter)
      .sort({ priority: 1, updatedAt: -1 })
      .lean();

    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createAdminContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    if (!type) return res.status(404).json({ success: false, message: "Unknown content type" });

    const payload = buildPayload(type, req.body, req.user?._id || null);
    payload.createdBy = req.user?._id || null;

    const item = await MarketplaceContent.create(payload);
    return res.status(201).json({
      success: true,
      message: "Marketplace content created",
      data: item,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function updateAdminContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    const id = req.params.id;
    if (!type || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const payload = buildPayload(type, req.body, req.user?._id || null);
    const item = await MarketplaceContent.findOneAndUpdate(
      { _id: id, type, deletedAt: null },
      payload,
      { new: true, runValidators: true },
    ).lean();

    if (!item) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    return res.json({
      success: true,
      message: "Marketplace content updated",
      data: item,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function deleteAdminContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    const id = req.params.id;
    if (!type || !mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const item = await MarketplaceContent.findOneAndUpdate(
      { _id: id, type, deletedAt: null },
      {
        isActive: false,
        deletedAt: new Date(),
        updatedBy: req.user?._id || null,
      },
      { new: true },
    ).lean();

    if (!item) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    return res.json({ success: true, message: "Marketplace content deleted" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}
