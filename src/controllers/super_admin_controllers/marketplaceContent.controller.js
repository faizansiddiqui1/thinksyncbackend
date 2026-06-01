import mongoose from "mongoose";

import MarketplaceContent, {
  createContentSlug,
} from "../../models/super_admin_models/MarketplaceContent.js";
import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
} from "../../config/s3.js";

const CMS_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const CMS_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CMS_IMAGE_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_SORT_FIELDS = new Set([
  "title",
  "priority",
  "createdAt",
  "updatedAt",
  "publishedAt",
]);

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

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getTenant(req) {
  return req.context?.tenant || req.tenant || null;
}

function getMediaKeys(item = {}) {
  return [item.image?.key, item.logo?.key].filter(Boolean);
}

async function cleanupMediaKeys(keys = [], tenant = null) {
  const uniqueKeys = [...new Set(keys.filter((key) => String(key).startsWith("marketplace-content/")))];
  await Promise.allSettled(uniqueKeys.map((key) => deleteFromStorage({ tenant, key })));
}

async function hydrateImage(image = {}, tenant = null) {
  if (!image?.key) return image || {};

  const url = await createSignedGetUrl({
    tenant,
    key: image.key,
    expiresSeconds: CMS_IMAGE_URL_TTL_SECONDS,
  }).catch(() => image.url || "");

  return { ...image, url };
}

async function hydrateItem(item, tenant = null) {
  if (!item) return item;
  const source = typeof item.toObject === "function" ? item.toObject() : item;
  const [image, logo] = await Promise.all([
    hydrateImage(source.image, tenant),
    hydrateImage(source.logo, tenant),
  ]);
  return { ...source, image, logo };
}

async function hydrateItems(items = [], tenant = null) {
  return Promise.all(items.map((item) => hydrateItem(item, tenant)));
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
    publishedAt: body.isActive === false ? null : cleanDate(body.publishedAt) || new Date(),
    updatedBy: userId,
  };

  if (type !== "offers") {
    payload.discountType = "";
  } else {
    if (!payload.code) throw createHttpError("Offer code is required");
    if (!["percentage", "flat"].includes(payload.discountType)) {
      throw createHttpError("Offer discount type must be percentage or flat");
    }
    if (payload.discountValue <= 0) {
      throw createHttpError("Offer discount value must be greater than zero");
    }
    if (payload.discountType === "percentage" && payload.discountValue > 100) {
      throw createHttpError("Percentage discount cannot exceed 100");
    }
    if (payload.validFrom && payload.validTill && payload.validTill < payload.validFrom) {
      throw createHttpError("Offer valid till date must be after valid from date");
    }
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

    const [rawItems, total] = await Promise.all([
      MarketplaceContent.find(filter)
        .sort({ priority: 1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MarketplaceContent.countDocuments(filter),
    ]);
    const items = await hydrateItems(rawItems, getTenant(req));

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

    const rawItem = await MarketplaceContent.findOne({
      ...publicFilter(type),
      slug,
    }).lean();

    if (!rawItem) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const item = await hydrateItem(rawItem, getTenant(req));
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
      const q = escapeRegex(String(req.query.q).trim());
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
      ];
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = parseLimit(req.query.limit, 10);
    const skip = (page - 1) * limit;
    const sortBy = ADMIN_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "updatedAt";
    const sortDirection = req.query.sortDir === "asc" ? 1 : -1;

    const [rawItems, total] = await Promise.all([
      MarketplaceContent.find(filter)
      .sort({ [sortBy]: sortDirection, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
      MarketplaceContent.countDocuments(filter),
    ]);
    const items = await hydrateItems(rawItems, getTenant(req));

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
      data: await hydrateItem(item, getTenant(req)),
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
    const original = await MarketplaceContent.findOne({
      _id: id,
      type,
      deletedAt: null,
    }).lean();
    if (!original) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const item = await MarketplaceContent.findOneAndUpdate(
      { _id: id, type, deletedAt: null },
      payload,
      { new: true, runValidators: true },
    ).lean();

    if (!item) {
      return res.status(404).json({ success: false, message: "Content not found" });
    }

    const removedKeys = getMediaKeys(original).filter((key) => !getMediaKeys(item).includes(key));
    await cleanupMediaKeys(removedKeys, getTenant(req));

    return res.json({
      success: true,
      message: "Marketplace content updated",
      data: await hydrateItem(item, getTenant(req)),
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

    await cleanupMediaKeys(getMediaKeys(item), getTenant(req));
    return res.json({ success: true, message: "Marketplace content deleted" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function bulkUpdateAdminContent(req, res) {
  try {
    const type = normalizeType(req.params.type);
    const ids = cleanArray(req.body.ids)
      .map((id) => String(id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const action = cleanText(req.body.action).toLowerCase();

    if (!type || !ids.length) throw createHttpError("Select at least one valid content item");
    if (!["activate", "deactivate", "delete"].includes(action)) {
      throw createHttpError("Unknown bulk action");
    }

    const filter = { _id: { $in: ids }, type, deletedAt: null };
    const update = {
      updatedBy: req.user?._id || null,
      ...(action === "activate" ? { isActive: true, publishedAt: new Date() } : {}),
      ...(action === "deactivate" ? { isActive: false } : {}),
      ...(action === "delete" ? { isActive: false, deletedAt: new Date() } : {}),
    };

    if (action === "delete") {
      const items = await MarketplaceContent.find(filter).select("image logo").lean();
      await cleanupMediaKeys(items.flatMap(getMediaKeys), getTenant(req));
    }

    const result = await MarketplaceContent.updateMany(filter, update);
    return res.json({
      success: true,
      message: `${result.modifiedCount || 0} content items updated`,
      data: { modifiedCount: result.modifiedCount || 0 },
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function createMarketplaceContentUpload(req, res) {
  try {
    const type = normalizeType(req.body.type);
    const filename = cleanText(req.body.filename);
    const contentType = cleanText(req.body.contentType).toLowerCase();
    const size = cleanNumber(req.body.size);
    const itemId = cleanText(req.body.itemId, "new");

    if (!type) throw createHttpError("Valid marketplace content type is required");
    if (!filename || !CMS_IMAGE_TYPES.has(contentType)) {
      throw createHttpError("Upload a jpg, jpeg, png, or webp image");
    }
    if (size <= 0 || size > CMS_IMAGE_MAX_BYTES) {
      throw createHttpError("Image size must be between 1 byte and 8 MB");
    }

    const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
    const random = Math.random().toString(36).slice(2, 8);
    const key = `marketplace-content/${type}/${itemId || "new"}/${Date.now()}_${random}.${extension}`;
    const tenant = getTenant(req);
    const upload = await createPresignedUpload({
      tenant,
      key,
      contentType,
      expiresSeconds: 900,
    });
    const previewUrl = await createSignedGetUrl({
      tenant,
      key,
      expiresSeconds: CMS_IMAGE_URL_TTL_SECONDS,
    }).catch(() => "");

    return res.json({
      success: true,
      message: "Marketplace image upload URL generated",
      data: { ...upload, previewUrl },
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function deleteMarketplaceContentUpload(req, res) {
  try {
    const key = cleanText(req.body.key);
    if (!key.startsWith("marketplace-content/")) {
      throw createHttpError("Invalid marketplace image key");
    }
    await deleteFromStorage({ tenant: getTenant(req), key });
    return res.json({ success: true, message: "Marketplace image deleted" });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}
