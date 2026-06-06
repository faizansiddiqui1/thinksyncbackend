import mongoose from "mongoose";

import {
  createPresignedUpload,
  createSignedGetUrl,
  deleteFromStorage,
} from "../../config/s3.js";
import DocCategory, {
  createDocSlug,
} from "../../models/super_admin_models/DocCategory.js";
import Document from "../../models/super_admin_models/Document.js";
import DocumentFeedback from "../../models/super_admin_models/DocumentFeedback.js";
import DocumentVersion from "../../models/super_admin_models/DocumentVersion.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const DOC_SORT_FIELDS = new Set([
  "title",
  "order",
  "updatedAt",
  "createdAt",
  "publishedAt",
]);

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function cleanStringArray(value) {
  return cleanArray(value)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function cleanMedia(value = {}) {
  if (typeof value === "string") {
    return { url: cleanText(value), key: "", alt: "" };
  }

  return {
    url: cleanText(value?.url),
    key: cleanText(value?.key),
    alt: cleanText(value?.alt),
  };
}

function cleanVideo(value = {}) {
  if (typeof value === "string") {
    return {
      title: "",
      url: cleanText(value),
      key: "",
      thumbnailUrl: "",
      duration: "",
      provider: "internal",
    };
  }

  return {
    title: cleanText(value?.title),
    url: cleanText(value?.url),
    key: cleanText(value?.key),
    thumbnailUrl: cleanText(value?.thumbnailUrl),
    duration: cleanText(value?.duration),
    provider: cleanText(value?.provider, "internal"),
  };
}

function cleanSeo(value = {}) {
  return {
    title: cleanText(value?.title),
    description: cleanText(value?.description),
    keywords: cleanStringArray(value?.keywords),
    canonicalUrl: cleanText(value?.canonicalUrl),
  };
}

function cleanFaq(value) {
  return cleanArray(value)
    .map((item) => ({
      question: cleanText(item?.question),
      answer: cleanText(item?.answer),
    }))
    .filter((item) => item.question);
}

function cleanRelatedDocs(value) {
  return cleanArray(value)
    .map((item, index) => {
      const docId = item?.doc || item?.document || item?._id || item?.id || "";
      return {
        doc: mongoose.Types.ObjectId.isValid(String(docId)) ? docId : null,
        title: cleanText(item?.title),
        slug: createDocSlug(item?.slug || item?.title),
        order: cleanNumber(item?.order, index + 1),
      };
    })
    .filter((item) => item.doc || item.slug || item.title);
}

function cleanContextualLinks(value) {
  return cleanArray(value)
    .map((item) => ({
      label: cleanText(item?.label),
      href: cleanText(item?.href),
      description: cleanText(item?.description),
    }))
    .filter((item) => item.label && item.href);
}

function parseLimit(value, fallback = 10) {
  return Math.min(Math.max(Number(value) || fallback, 1), 100);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createHttpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getTenant(req) {
  return req.context?.tenant || req.tenant || null;
}

async function hydrateMedia(media = {}, tenant = null) {
  if (!media?.key) return media || {};
  const url = await createSignedGetUrl({
    tenant,
    key: media.key,
    expiresSeconds: SIGNED_URL_TTL_SECONDS,
  }).catch(() => media.url || "");
  return { ...media, url };
}

async function hydrateDocument(document, tenant = null) {
  if (!document) return document;
  const source = typeof document.toObject === "function" ? document.toObject() : document;
  const [coverImage, videoUrl] = await Promise.all([
    hydrateMedia(source.coverImage, tenant),
    source.video?.key
      ? createSignedGetUrl({
          tenant,
          key: source.video.key,
          expiresSeconds: SIGNED_URL_TTL_SECONDS,
        }).catch(() => source.video?.url || source.videoUrl || "")
      : Promise.resolve(source.video?.url || source.videoUrl || ""),
  ]);

  return {
    ...source,
    coverImage,
    video: {
      ...(source.video || {}),
      url: videoUrl,
    },
    videoUrl,
  };
}

async function hydrateDocuments(documents = [], tenant = null) {
  return Promise.all(documents.map((document) => hydrateDocument(document, tenant)));
}

async function snapshotDocument(document, userId = null, changeNote = "") {
  const source = typeof document.toObject === "function" ? document.toObject() : document;
  await DocumentVersion.create({
    document: source._id,
    version: source.version || "v1",
    title: source.title || "",
    slug: source.slug || "",
    changeNote,
    snapshot: source,
    createdBy: userId,
  });
}

async function resolveCategoryId(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  if (mongoose.Types.ObjectId.isValid(raw)) {
    const category = await DocCategory.findOne({
      _id: raw,
      deletedAt: null,
    }).select("_id");
    return category?._id || null;
  }

  const category = await DocCategory.findOne({
    slug: createDocSlug(raw),
    deletedAt: null,
  }).select("_id");
  return category?._id || null;
}

function buildCategoryPayload(body = {}, userId = null) {
  const title = cleanText(body.title || body.name);
  if (!title) throw createHttpError("Category title is required");

  const parentId = cleanText(body.parentCategory || body.parentCategoryId);

  return {
    title,
    slug: createDocSlug(body.slug || title),
    description: cleanText(body.description),
    icon: cleanText(body.icon, "book-open"),
    parentCategory: mongoose.Types.ObjectId.isValid(parentId) ? parentId : null,
    order: cleanNumber(body.order, 100),
    isActive: body.isActive !== false,
    seo: cleanSeo(body.seo),
    updatedBy: userId,
  };
}

async function buildDocumentPayload(body = {}, userId = null) {
  const title = cleanText(body.title);
  if (!title) throw createHttpError("Document title is required");

  const categoryId = await resolveCategoryId(body.category || body.categoryId || body.categorySlug);
  if (!categoryId) throw createHttpError("Valid document category is required");

  const status = ["draft", "published", "archived"].includes(cleanText(body.status))
    ? cleanText(body.status)
    : "draft";
  const video = cleanVideo(body.video || body.videoUrl);
  const publishedAt =
    status === "published"
      ? body.publishedAt
        ? new Date(body.publishedAt)
        : new Date()
      : null;

  return {
    title,
    slug: createDocSlug(body.slug || title),
    category: categoryId,
    coverImage: cleanMedia(body.coverImage || body.coverImageUrl),
    video,
    videoUrl: cleanText(body.videoUrl || video.url),
    summary: cleanText(body.summary || body.description),
    content: cleanText(body.content || body.mdx || body.mdxContent),
    keyPoints: cleanStringArray(body.keyPoints),
    useCases: cleanStringArray(body.useCases),
    bestPractices: cleanStringArray(body.bestPractices),
    warnings: cleanStringArray(body.warnings),
    examples: cleanStringArray(body.examples),
    faq: cleanFaq(body.faq),
    relatedDocs: cleanRelatedDocs(body.relatedDocs),
    contextualLinks: cleanContextualLinks(body.contextualLinks),
    audience: cleanStringArray(body.audience),
    tags: cleanStringArray(body.tags),
    language: cleanText(body.language, "en"),
    version: cleanText(body.version, "v1"),
    status,
    isActive: body.isActive !== false,
    isFeatured: Boolean(body.isFeatured),
    order: cleanNumber(body.order, 100),
    seo: cleanSeo(body.seo),
    publishedAt,
    updatedBy: userId,
  };
}

async function getVersions() {
  const versions = await Document.distinct("version", {
    deletedAt: null,
    isActive: true,
  });
  return versions.filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
}

export async function listPublicDocsNavigation(req, res) {
  try {
    const version = cleanText(req.query.version, "v1");
    const query = cleanText(req.query.q);

    const categoryFilter = {
      deletedAt: null,
      isActive: true,
    };
    const docFilter = {
      deletedAt: null,
      isActive: true,
      status: "published",
      version,
    };

    if (query) {
      const q = escapeRegex(query);
      docFilter.$or = [
        { title: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    const [categories, rawDocuments, versions] = await Promise.all([
      DocCategory.find(categoryFilter)
        .sort({ order: 1, title: 1 })
        .lean(),
      Document.find(docFilter)
        .select(
          "title slug summary category order tags audience version videoUrl readingTime updatedAt publishedAt isFeatured",
        )
        .populate("category", "title slug order")
        .sort({ order: 1, title: 1 })
        .lean(),
      getVersions(),
    ]);
    const documents = await hydrateDocuments(rawDocuments, getTenant(req));

    return res.json({
      success: true,
      data: {
        categories,
        documents,
        versions: versions.length ? versions : [version],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function searchPublicDocs(req, res) {
  try {
    const version = cleanText(req.query.version, "v1");
    const query = cleanText(req.query.q);
    const limit = parseLimit(req.query.limit, 20);
    const filter = {
      deletedAt: null,
      isActive: true,
      status: "published",
      version,
    };

    if (query) {
      const q = escapeRegex(query);
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    const rawItems = await Document.find(filter)
      .select("title slug summary category order tags version readingTime updatedAt")
      .populate("category", "title slug")
      .sort({ isFeatured: -1, order: 1, updatedAt: -1 })
      .limit(limit)
      .lean();
    const items = await hydrateDocuments(rawItems, getTenant(req));

    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getPublicDoc(req, res) {
  try {
    const slug = createDocSlug(req.params.slug);
    const version = cleanText(req.query.version, "v1");
    if (!slug) return res.status(404).json({ success: false, message: "Document not found" });

    const filter = {
      slug,
      deletedAt: null,
      isActive: true,
      status: "published",
    };

    const rawDocument = await Document.findOne({ ...filter, version })
      .populate("category", "title slug description order")
      .populate("relatedDocs.doc", "title slug summary")
      .lean();

    const fallbackDocument = rawDocument
      ? null
      : await Document.findOne(filter)
          .populate("category", "title slug description order")
          .populate("relatedDocs.doc", "title slug summary")
          .sort({ updatedAt: -1 })
          .lean();

    const document = rawDocument || fallbackDocument;
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    return res.json({
      success: true,
      data: await hydrateDocument(document, getTenant(req)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createDocFeedback(req, res) {
  try {
    const slug = createDocSlug(req.params.slug);
    const helpful = req.body?.helpful === true || req.body?.helpful === "true";
    const document = await Document.findOne({
      slug,
      deletedAt: null,
      status: "published",
    }).select("_id slug");

    const feedback = await DocumentFeedback.create({
      document: document?._id || null,
      slug,
      helpful,
      rating:
        req.body?.rating === undefined || req.body?.rating === ""
          ? null
          : Math.min(Math.max(cleanNumber(req.body.rating, 1), 1), 5),
      comment: cleanText(req.body?.comment),
      email: cleanText(req.body?.email).toLowerCase(),
      path: cleanText(req.body?.path || req.get("referer")),
      userAgent: cleanText(req.get("user-agent")),
      ipAddress: cleanText(req.ip || req.headers["x-forwarded-for"]),
    });

    return res.status(201).json({
      success: true,
      message: "Thanks for the documentation feedback",
      data: feedback,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function listAdminDocCategories(req, res) {
  try {
    const filter = { deletedAt: null };
    if (req.query.active === "true") filter.isActive = true;
    if (req.query.active === "false") filter.isActive = false;
    if (req.query.q) {
      const q = escapeRegex(req.query.q);
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const categories = await DocCategory.find(filter)
      .sort({ order: 1, title: 1 })
      .lean();

    return res.json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createAdminDocCategory(req, res) {
  try {
    const payload = buildCategoryPayload(req.body, req.user?._id || null);
    payload.createdBy = req.user?._id || null;
    const category = await DocCategory.create(payload);
    return res.status(201).json({
      success: true,
      message: "Documentation category created",
      data: category,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function updateAdminDocCategory(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    const payload = buildCategoryPayload(req.body, req.user?._id || null);
    const category = await DocCategory.findOneAndUpdate(
      { _id: id, deletedAt: null },
      payload,
      { new: true, runValidators: true },
    ).lean();

    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    return res.json({
      success: true,
      message: "Documentation category updated",
      data: category,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function deleteAdminDocCategory(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const documentCount = await Document.countDocuments({
      category: id,
      deletedAt: null,
    });
    if (documentCount > 0) {
      return res.status(409).json({
        success: false,
        message: "Move or delete documents in this category first",
      });
    }

    await DocCategory.findOneAndUpdate(
      { _id: id, deletedAt: null },
      {
        isActive: false,
        deletedAt: new Date(),
        updatedBy: req.user?._id || null,
      },
    );

    return res.json({ success: true, message: "Documentation category deleted" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function listAdminDocuments(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = parseLimit(req.query.limit, 10);
    const skip = (page - 1) * limit;
    const filter = { deletedAt: null };

    if (req.query.status && req.query.status !== "all") {
      filter.status = req.query.status;
    }
    if (req.query.version && req.query.version !== "all") {
      filter.version = req.query.version;
    }
    if (req.query.category && req.query.category !== "all") {
      const categoryId = await resolveCategoryId(req.query.category);
      if (categoryId) filter.category = categoryId;
    }
    if (req.query.q) {
      const q = escapeRegex(req.query.q);
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    const sortBy = DOC_SORT_FIELDS.has(req.query.sortBy) ? req.query.sortBy : "updatedAt";
    const sortDir = req.query.sortDir === "asc" ? 1 : -1;

    const [rawItems, total, versions] = await Promise.all([
      Document.find(filter)
        .populate("category", "title slug order")
        .sort({ [sortBy]: sortDir, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
      getVersions(),
    ]);
    const items = await hydrateDocuments(rawItems, getTenant(req));

    return res.json({
      success: true,
      data: items,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
        versions,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAdminDocument(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const document = await Document.findOne({ _id: id, deletedAt: null })
      .populate("category", "title slug")
      .populate("relatedDocs.doc", "title slug summary")
      .lean();
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    return res.json({
      success: true,
      data: await hydrateDocument(document, getTenant(req)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createAdminDocument(req, res) {
  try {
    const payload = await buildDocumentPayload(req.body, req.user?._id || null);
    payload.createdBy = req.user?._id || null;
    const document = await Document.create(payload);
    await snapshotDocument(document, req.user?._id || null, "Initial document created");

    return res.status(201).json({
      success: true,
      message: "Documentation article created",
      data: await hydrateDocument(
        await Document.findById(document._id).populate("category", "title slug").lean(),
        getTenant(req),
      ),
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function updateAdminDocument(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const payload = await buildDocumentPayload(req.body, req.user?._id || null);
    const document = await Document.findOneAndUpdate(
      { _id: id, deletedAt: null },
      payload,
      { new: true, runValidators: true },
    ).populate("category", "title slug");

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    await snapshotDocument(
      document,
      req.user?._id || null,
      cleanText(req.body?.changeNote, "Document updated"),
    );

    return res.json({
      success: true,
      message: "Documentation article updated",
      data: await hydrateDocument(document, getTenant(req)),
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function deleteAdminDocument(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const document = await Document.findOneAndUpdate(
      { _id: id, deletedAt: null },
      {
        status: "archived",
        isActive: false,
        deletedAt: new Date(),
        updatedBy: req.user?._id || null,
      },
      { new: true },
    );

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    return res.json({ success: true, message: "Documentation article deleted" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function listAdminDocumentVersions(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    const versions = await DocumentVersion.find({ document: id })
      .sort({ createdAt: -1 })
      .limit(parseLimit(req.query.limit, 30))
      .lean();

    return res.json({ success: true, data: versions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function restoreAdminDocumentVersion(req, res) {
  try {
    const { id, versionId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(String(id)) ||
      !mongoose.Types.ObjectId.isValid(String(versionId))
    ) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }

    const version = await DocumentVersion.findOne({
      _id: versionId,
      document: id,
    }).lean();
    if (!version?.snapshot) {
      return res.status(404).json({ success: false, message: "Version not found" });
    }

    const snapshot = { ...version.snapshot };
    delete snapshot._id;
    delete snapshot.createdAt;
    delete snapshot.updatedAt;
    snapshot.updatedBy = req.user?._id || null;

    const document = await Document.findOneAndUpdate(
      { _id: id, deletedAt: null },
      snapshot,
      { new: true, runValidators: true },
    ).populate("category", "title slug");

    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found" });
    }

    await snapshotDocument(document, req.user?._id || null, "Version restored");

    return res.json({
      success: true,
      message: "Documentation version restored",
      data: await hydrateDocument(document, getTenant(req)),
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function listAdminDocFeedback(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = parseLimit(req.query.limit, 15);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
    if (req.query.helpful === "true") filter.helpful = true;
    if (req.query.helpful === "false") filter.helpful = false;
    if (req.query.q) {
      const q = escapeRegex(req.query.q);
      filter.$or = [
        { slug: { $regex: q, $options: "i" } },
        { comment: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      DocumentFeedback.find(filter)
        .populate("document", "title slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DocumentFeedback.countDocuments(filter),
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

export async function updateAdminDocFeedback(req, res) {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(404).json({ success: false, message: "Feedback not found" });
    }
    const status = ["new", "reviewed", "resolved"].includes(req.body?.status)
      ? req.body.status
      : "reviewed";

    const item = await DocumentFeedback.findByIdAndUpdate(
      id,
      {
        status,
        reviewedBy: req.user?._id || null,
        reviewedAt: new Date(),
      },
      { new: true },
    ).lean();

    if (!item) {
      return res.status(404).json({ success: false, message: "Feedback not found" });
    }

    return res.json({
      success: true,
      message: "Documentation feedback updated",
      data: item,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

export async function createDocsUpload(req, res) {
  try {
    const kind = cleanText(req.body.kind, "image").toLowerCase();
    const filename = cleanText(req.body.filename);
    const contentType = cleanText(req.body.contentType).toLowerCase();
    const size = cleanNumber(req.body.size);
    const itemId = cleanText(req.body.itemId, "new");
    const allowed = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const maxBytes = kind === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;

    if (!["image", "video"].includes(kind)) {
      throw createHttpError("Upload kind must be image or video");
    }
    if (!filename || !allowed.has(contentType)) {
      throw createHttpError(
        kind === "video"
          ? "Upload an mp4, webm, or mov video"
          : "Upload a jpg, jpeg, png, or webp image",
      );
    }
    if (size <= 0 || size > maxBytes) {
      throw createHttpError(
        kind === "video"
          ? "Video size must be between 1 byte and 250 MB"
          : "Image size must be between 1 byte and 8 MB",
      );
    }

    const extension =
      contentType === "image/jpeg"
        ? "jpg"
        : contentType === "video/quicktime"
          ? "mov"
          : contentType.split("/")[1];
    const random = Math.random().toString(36).slice(2, 8);
    const key = `documentation/${kind}/${itemId || "new"}/${Date.now()}_${random}.${extension}`;
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
      expiresSeconds: SIGNED_URL_TTL_SECONDS,
    }).catch(() => "");

    return res.json({
      success: true,
      message: "Documentation upload URL generated",
      data: { ...upload, previewUrl, kind },
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}

export async function deleteDocsUpload(req, res) {
  try {
    const key = cleanText(req.body.key);
    if (!key.startsWith("documentation/")) {
      throw createHttpError("Invalid documentation asset key");
    }

    await deleteFromStorage({ tenant: getTenant(req), key });
    return res.json({ success: true, message: "Documentation asset deleted" });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
}
