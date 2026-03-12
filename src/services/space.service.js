// services/space.service.js
import mongoose from "mongoose";
import slugify from "slugify";
import Space from "../models/admin_models/Space.js";
import { normalizePagination, metaFor } from "../utils/pagination.js";

import SpaceMedia from "../models/admin_models/SpaceMedia.js";
import ResourceSchema from "../models/admin_models/ResourceSchema.js";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Offer from "../models/admin_models/Offer.js";

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
    if (!userId) {
      throw new Error("User id required to create space");
    }

    spaceData.owner = userId; // ⭐ THIS IS THE FIX

    const space = new Space(spaceData);
    await space.save();
    return space;
  } catch (error) {
    console.error("[serviceCreateSpace] error saving space:", error);
    throw error;
  }
};
// Get all Spaces
// service: getAllSpaces(rawQuery = {}, options = {})
export const getAllSpaces = async (rawQuery = {}, options = {}) => {
  const { page, limit, skip } = normalizePagination(options);
  const sort = options.sort || { createdAt: -1 };

  const q = {};

  // ================================
  // ADMIN VIEW (user logged in)
  // ================================
  if (options.ownerId) {
    q.owner = options.ownerId;

    if (rawQuery.status === "DRAFT") {
      q.isPublished = false;
    } else if (rawQuery.status === "PUBLISHED") {
      q.isPublished = true;
    }
    // if no status -> show both
  }

  // ================================
  // PUBLIC VIEW
  // ================================
  else {
    q.isPublished = true;
  }

  // filters
  if (rawQuery.city) q["address.city"] = String(rawQuery.city);
  if (rawQuery.spaceType) q.spaceType = String(rawQuery.spaceType);
  if (rawQuery.featured === "true" || rawQuery.featured === true)
    q.isFeatured = true;

  // safe search
  if (rawQuery.search) {
    q.$or = [
      { name: { $regex: rawQuery.search, $options: "i" } },
      { tagline: { $regex: rawQuery.search, $options: "i" } },
      { "address.city": { $regex: rawQuery.search, $options: "i" } },
    ];
  }

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

  const itemsWithMedia = items.map((s) => ({
    ...s,
    media: mediaMap.get(String(s._id)) || { images: [], video: null },
  }));

  return { items: itemsWithMedia, meta: metaFor(total, page, limit) };
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

// ===================================================
// USER SIDE
// ===================================================

export const fetchSpacesListing = async (rawQuery = {}) => {
  const page = Math.max(parseInt(rawQuery.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(rawQuery.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const sort = rawQuery.sort || { createdAt: -1 };

  /* =========================
      FILTER QUERY
  ========================= */

  const q = { isPublished: true };

  if (rawQuery.city) q["address.city"] = String(rawQuery.city);
  if (rawQuery.spaceType) q.spaceType = String(rawQuery.spaceType);

  if (rawQuery.featured === "true" || rawQuery.featured === true) {
    q.isFeatured = true;
  }

  if (rawQuery.search) {
    const s = String(rawQuery.search);
    q.$or = [
      { name: { $regex: s, $options: "i" } },
      { tagline: { $regex: s, $options: "i" } },
      { "address.city": { $regex: s, $options: "i" } },
    ];
  }

  /* =========================
      FETCH SPACES
  ========================= */

  const [items, total] = await Promise.all([
    Space.find(q)
      .select(
        "name slug shortDescription startingPrice spaceType address averageRating isFeatured amenities"
      )
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),

    Space.countDocuments(q),
  ]);

  if (!items.length) return { items: [], meta: metaFor(total, page, limit) };

  /* =========================
      FETCH MEDIA
  ========================= */

  const ids = items.map((s) => s._id);

  const medias = await SpaceMedia.find({ space: { $in: ids } })
    .select("space images")
    .lean()
    .exec();

  const mediaMap = new Map(medias.map((m) => [m.space.toString(), m]));

  /* =========================
      FINAL RESPONSE FORMAT
  ========================= */

  const itemsWithMedia = items.map((s) => {
    const media = mediaMap.get(String(s._id));

    return {
      _id: s._id,
      name: s.name,
      slug: s.slug,

      city: s.address?.city,
      state: s.address?.state,

      spaceType: s.spaceType,
      startingPrice: s.startingPrice,

      rating: s.averageRating,
      isFeatured: s.isFeatured,

      amenities: s.amenities?.slice(0, 3) || [],

      thumbnail: media?.images?.[0]?.url || null, // ⭐ card image
    };
  });

  return {
    items: itemsWithMedia,
    meta: metaFor(total, page, limit),
  };
};

export const fetchSpaceDetailsBySlug = async (slug) => {
  if (!slug) throw new Error("slug required");

  // find published space by slug
  const spaceDoc = await Space.findOne({ slug, isPublished: true })
    .lean()
    .exec();
  if (!spaceDoc) throw new Error("Space not found");

  const spaceId = spaceDoc._id;

  const [resources, pricingPlans, offers, media] = await Promise.all([
    ResourceSchema.find({ space: spaceId }).lean().exec(),
    PricingPlan.find({ space: spaceId }).lean().exec(),
    Offer.find({ space: spaceId }).lean().exec(),
    SpaceMedia.findOne({ space: spaceId }).select("images video").lean().exec(),
  ]);

  const normalizedMedia = media || { images: [], video: null };

  const pricingPlansSnapshot = pricingPlans.map((p) => ({
    ...p,
    priceSnapshot: p.price ?? p.amount ?? p.hourly ?? p.daily ?? null,
  }));

  return {
    ...spaceDoc,
    resources: resources || [],
    pricingPlans: pricingPlansSnapshot || [],
    offers: offers || [],
    media: normalizedMedia,
  };
};
