// services/space.service.js
import mongoose from "mongoose";
import slugify from "slugify";
import Space from "../models/admin_models/Space.js";
import { normalizePagination, metaFor } from "../utils/pagination.js";

import SpaceMedia from "../models/admin_models/SpaceMedia.js";

const ALLOWED_FIELDS = [
  "name",
  "shortDescription",
  "longDescription",
  "tagline",
  "spaceType",
  "capacity",
  "address",
  "images",
  "videos",
  "amenities",
  "highlights",
  "houseRules",
  "wifi",
  "parking",
  "transport",
  "contact",
  "billing",
  "isFeatured",
  "isPublished",
  "tags",
  "categories",
  "adminNotes",
  "internalFlags",
];

const isPlainObject = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

// ===================================================
// Create Spaces
// ===================================================
export const createSpace = async (spaceData, userId = null) => {
  try {
    if (userId) {
      spaceData.createdBy = userId;
      spaceData.updatedBy = userId;
    }
    const space = new Space(spaceData);
    await space.save();
    return space;
  } catch (error) {
    console.error("[serviceCreateSpace] error saving space:", error);
    // rethrow so controller can handle it and respond with appropriate status/message
    throw error;
  }
};

// Get all Spaces
// service: getAllSpaces(rawQuery = {}, options = {})
export const getAllSpaces = async (rawQuery = {}, options = {}) => {
  const { page, limit, skip } = normalizePagination(options);
  const sort = options.sort || { isFeatured: -1, createdAt: -1 };

  // default behaviour: public listing -> isPublished true
  const q = {};

  // support status filter if provided (DRAFT or PUBLISHED)
  if (rawQuery.status) {
    // expecting "DRAFT" or "PUBLISHED"
    q.status = String(rawQuery.status);
  } else {
    // default for public endpoint — only published
    q.isPublished = true;
  }

  if (rawQuery.city) q["address.city"] = String(rawQuery.city);
  if (rawQuery.spaceType) q.spaceType = String(rawQuery.spaceType);
  if (rawQuery.featured === "true" || rawQuery.featured === true)
    q.isFeatured = true;
  if (rawQuery.search) q.$text = { $search: String(rawQuery.search) };

  const [items, total] = await Promise.all([
    Space.find(q).sort(sort).skip(skip).limit(limit).lean().exec(),
    Space.countDocuments(q).exec(),
  ]);

  if (!items.length) return { items: [], meta: metaFor(total, page, limit) };

  const ids = items.map((s) => s._id);
  const medias = await SpaceMedia.find({ space: { $in: ids } })
    .select("space images video")
    .lean()
    .exec();

  const mediaMap = new Map(medias.map((m) => [m.space.toString(), m]));

  const itemsWithMedia = items.map((s) => {
    const m = mediaMap.get(String(s._id));
    return {
      ...s,
      media: m || { images: [], video: null },
    };
  });

  return { items: itemsWithMedia, meta: metaFor(total, page, limit) };
};


// Get Space by slug
export const getSpaceBySlug = async (slug, opts = {}) => {
  let q = Space.findOne({ slug, isPublished: true });

  // if populate requested, run populate and use document -> toObject
  if (Array.isArray(opts.populate) && opts.populate.length) {
    q = q.populate(opts.populate);
    const doc = await q.exec();
    if (!doc) throw new Error("Space not found");
    const space = doc.toObject();

    const media = await SpaceMedia.findOne({ space: space._id })
      .select("images video")
      .lean()
      .exec();

    space.media = media || { images: [], video: null };
    return space;
  }

  // fast path with lean
  const space = await q.lean().exec();
  if (!space) throw new Error("Space not found");

  const media = await SpaceMedia.findOne({ space: space._id })
    .select("images video")
    .lean()
    .exec();

  space.media = media || { images: [], video: null };
  return space;
};

// Get Space by id
export const getSpaceById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid space id");

  // fetch space as plain object
  const space = await Space.findById(id).lean().exec();
  if (!space) throw new Error("Space not found");

  // fetch media for this space
  const media = await SpaceMedia.findOne({ space: space._id })
    .select("images video")
    .lean()
    .exec();

  // attach media (always return consistent shape)
  space.media = media || { images: [], video: null };
  return space;
};

// Update Space
export const updateSpace = async (id, updateData, userId = null) => {
  const space = await Space.findById(id);
  if (!space) throw new Error("Space not found");

  if (updateData.name && !updateData.slug) {
    updateData.slug = slugify(updateData.name, { lower: true, strict: true });
  }

  for (const key of ALLOWED_FIELDS) {
    if (updateData[key] === undefined) continue;

    const incoming = updateData[key];

    if (isPlainObject(incoming) && isPlainObject(space[key])) {
      Object.assign(space[key], incoming);
    } else {
      space[key] = incoming;
    }
  }

  if (userId) space.updatedBy = userId;
  await space.save();
  return space;
};

// Delete Space
export const deleteSpace = async (id) => {
  const space = await Space.findByIdAndDelete(id).exec();
  if (!space) throw new Error("Space not found");
  return space;
};
