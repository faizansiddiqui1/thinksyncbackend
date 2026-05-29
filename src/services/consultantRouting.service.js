import mongoose from "mongoose";

import Space from "../models/admin_models/Space.js";
import City from "../models/super_admin_models/City.model.js";
import Consultant from "../models/super_admin_models/Consultant.js";

const WILDCARD_VALUES = new Set(["all", "*", "any", "default"]);

export function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeProductType(value) {
  const key = normalizeKey(value);

  if (!key) return "";
  if (["cowork", "coworking", "cowork_space", "coworking_space"].includes(key)) {
    return "coworking_space";
  }
  if (["virtual", "virtual_office", "vertual_office"].includes(key)) {
    return "virtual_office";
  }
  if (["private", "private_office", "office_space"].includes(key)) {
    return "private_office";
  }
  if (["managed", "managed_office"].includes(key)) {
    return "managed_office";
  }
  if (["meeting", "meeting_room"].includes(key)) {
    return "meeting_room";
  }

  return key;
}

export function normalizeSpaceType(value) {
  return normalizeProductType(value);
}

function idString(value) {
  if (!value) return "";
  return String(value?._id || value);
}

function hasWildcard(values = []) {
  return !values.length || values.some((value) => WILDCARD_VALUES.has(normalizeKey(value)));
}

function includesNormalized(values = [], expected = "") {
  const normalizedExpected = normalizeProductType(expected);
  if (!normalizedExpected) return hasWildcard(values);

  return values
    .map((value) => normalizeProductType(value))
    .some((value) => value === normalizedExpected || WILDCARD_VALUES.has(value));
}

async function resolveCity(cityInput) {
  if (!cityInput) return null;

  const raw = String(cityInput?._id || cityInput).trim();
  if (!raw) return null;

  if (mongoose.Types.ObjectId.isValid(raw)) {
    return City.findById(raw).select("_id name slug").lean();
  }

  const key = raw.toLowerCase();
  return City.findOne({
    $or: [
      { slug: key },
      { name: { $regex: `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
    ],
  })
    .select("_id name slug")
    .lean();
}

async function resolveListing({ listingId, listingSlug, spaceId }) {
  const id = listingId || spaceId;

  if (id && mongoose.Types.ObjectId.isValid(String(id))) {
    return Space.findById(id)
      .populate("address.city", "name slug")
      .select("name slug spaceType address listingModes")
      .lean();
  }

  if (listingSlug) {
    return Space.findOne({ slug: String(listingSlug).trim().toLowerCase() })
      .populate("address.city", "name slug")
      .select("name slug spaceType address listingModes")
      .lean();
  }

  return null;
}

export async function buildRoutingContext(input = {}) {
  const listing = await resolveListing(input);
  const cityDoc =
    (await resolveCity(input.city || input.cityId || listing?.address?.city)) || null;

  const spaceType = normalizeSpaceType(
    input.spaceType ||
      input.listingType ||
      input.product ||
      input.productType ||
      listing?.spaceType,
  );

  const productType = normalizeProductType(
    input.productType || input.product || input.category || spaceType,
  );

  return {
    cityId: cityDoc?._id || null,
    cityName: cityDoc?.name || input.cityName || input.city || "",
    citySlug: cityDoc?.slug || "",
    productType,
    spaceType,
    pageType: input.pageType || input.sourcePage || "",
    sourceUrl: input.sourceUrl || input.sourceURL || input.path || "",
    listing: listing
      ? {
          _id: listing._id,
          name: listing.name,
          slug: listing.slug,
          spaceType: listing.spaceType,
        }
      : null,
  };
}

function scoreConsultant(consultant, context) {
  const cityId = idString(context.cityId);
  const listingId = idString(context.listing?._id);

  const assignedCityIds = (consultant.assignedCities || []).map(idString);
  const assignedProducts = consultant.assignedProductTypes || [];
  const assignedSpaces = consultant.assignedSpaceTypes || [];
  const explicitListings = (consultant.visibilityRules?.listingIds || []).map(idString);

  const listingMatch = listingId && explicitListings.includes(listingId);
  const cityExact = cityId && assignedCityIds.includes(cityId);
  const cityWildcard = !assignedCityIds.length || consultant.visibilityRules?.globalFallback;
  const cityFallback = cityId && consultant.visibilityRules?.cityFallback && cityExact;

  const productExact = includesNormalized(assignedProducts, context.productType);
  const productWildcard = hasWildcard(assignedProducts);
  const spaceExact = includesNormalized(assignedSpaces, context.spaceType);
  const spaceWildcard = hasWildcard(assignedSpaces);

  if (!listingMatch) {
    if (assignedCityIds.length && !cityExact) return null;
    if (!productExact && !productWildcard) return null;
    if (!spaceExact && !spaceWildcard) return null;
  }

  let score = 0;
  if (listingMatch) score += 250;
  if (cityExact) score += 100;
  else if (cityWildcard) score += 15;
  if (cityFallback) score += 20;
  if (productExact && !productWildcard) score += 55;
  else if (productWildcard) score += 12;
  if (spaceExact && !spaceWildcard) score += 35;
  else if (spaceWildcard) score += 8;

  score -= Number(consultant.priority || 100) / 100;

  let confidence = "fallback";
  if (listingMatch) confidence = "listing";
  else if (cityExact && productExact && spaceExact) confidence = "exact";
  else if (cityExact && productExact) confidence = "city_product";
  else if (cityExact) confidence = "city";

  return { score, confidence };
}

export function maskPhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 5) return phone ? "Contact available" : "";
  const prefix = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}-` : "+91-";
  const local = digits.slice(-10);
  return `${prefix}${local.slice(0, 3)}*****${local.slice(-2)}`;
}

export function maskEmail(email = "") {
  const value = String(email || "").trim();
  const [name, domain] = value.split("@");
  if (!name || !domain) return "";
  const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

export function serializeConsultant(consultant, { publicView = true, match = null } = {}) {
  if (!consultant) return null;

  const imageUrl =
    consultant.profileImage?.url ||
    consultant.profileImageUrl ||
    "";

  const base = {
    _id: consultant._id,
    name: consultant.name,
    designation: consultant.designation || "Workspace Consultant",
    profileImageUrl: imageUrl,
    publicProfile: consultant.publicProfile || {},
    isActive: consultant.isActive,
    priority: consultant.priority,
    matchConfidence: match?.confidence || null,
    supportText:
      consultant.visibilityRules?.notes ||
      "Your ThinkSync workspace consultant will help with pricing, tours, setup, and next steps.",
  };

  if (publicView) {
    return {
      ...base,
      phoneMasked: maskPhone(consultant.phone),
      emailMasked: maskEmail(consultant.email),
      contactActions: {
        call: Boolean(consultant.phone),
        whatsapp: Boolean(consultant.phone),
        email: Boolean(consultant.email),
      },
    };
  }

  return {
    ...base,
    phone: consultant.phone,
    email: consultant.email,
    profileImage: consultant.profileImage || {},
    assignedCities: consultant.assignedCities || [],
    assignedProductTypes: consultant.assignedProductTypes || [],
    assignedSpaceTypes: consultant.assignedSpaceTypes || [],
    notes: consultant.notes || "",
    visibilityRules: consultant.visibilityRules || {},
    publicProfile: consultant.publicProfile || {},
    requestApprovalStatus: consultant.requestApprovalStatus,
    sourceOfMapping: consultant.sourceOfMapping,
    linkedUser: consultant.linkedUser || null,
    createdAt: consultant.createdAt,
    updatedAt: consultant.updatedAt,
  };
}

export async function findMatchingConsultant(input = {}, options = {}) {
  const context = await buildRoutingContext(input);

  const consultants = await Consultant.find({
    isActive: true,
    "visibilityRules.hiddenFromPublic": { $ne: true },
  })
    .populate("assignedCities", "name slug")
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  let best = null;
  let bestMatch = null;

  for (const consultant of consultants) {
    const match = scoreConsultant(consultant, context);
    if (!match) continue;

    if (!best || match.score > bestMatch.score) {
      best = consultant;
      bestMatch = match;
    }
  }

  if (!best && consultants.length) {
    best = consultants[0];
    bestMatch = { score: 0, confidence: "global_fallback" };
  }

  return {
    consultant: serializeConsultant(best, {
      publicView: options.publicView !== false,
      match: bestMatch,
    }),
    consultantDoc: best,
    context,
    match: bestMatch,
  };
}

export async function getConsultantForUser(userId) {
  if (!userId) return null;

  return Consultant.findOne({ linkedUser: userId })
    .populate("assignedCities", "name slug")
    .lean();
}
