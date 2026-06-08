import mongoose from "mongoose";

import Space from "../models/admin_models/Space.js";
import City from "../models/super_admin_models/City.model.js";
import Consultant from "../models/super_admin_models/Consultant.js";
import { createSignedGetUrl } from "../config/s3.js";

const WILDCARD_VALUES = new Set(["all", "*", "any", "default"]);
const CONSULTANT_IMAGE_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

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
  if (["coworking_long_term", "coworking_short_term"].includes(key)) {
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
  if (["event", "event_space", "events"].includes(key)) {
    return "event_space";
  }
  if (["meeting", "meeting_room"].includes(key)) {
    return "meeting_room";
  }

  return key;
}

export function normalizeSpaceType(value) {
  return normalizeProductType(value);
}

export function normalizeListingMode(value) {
  const key = normalizeKey(value);
  if (["long", "longterm", "long_term", "long_term_leasing"].includes(key)) {
    return "long_term";
  }
  if (["short", "shortterm", "short_term", "short_term_leasing"].includes(key)) {
    return "short_term";
  }
  return key;
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

function includesListingMode(values = [], expected = "") {
  const normalizedExpected = normalizeListingMode(expected);
  if (!normalizedExpected) return hasWildcard(values);

  return values
    .map((value) => normalizeListingMode(value))
    .some((value) => value === normalizedExpected || WILDCARD_VALUES.has(value));
}

function isExactNormalized(values = [], expected = "", normalizer = normalizeProductType) {
  const normalizedExpected = normalizer(expected);
  if (!normalizedExpected) return false;
  return values.map(normalizer).some((value) => value === normalizedExpected);
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
      .select("name slug spaceType address listingModes owner")
      .lean();
  }

  if (listingSlug) {
    return Space.findOne({ slug: String(listingSlug).trim().toLowerCase() })
      .populate("address.city", "name slug")
      .select("name slug spaceType address listingModes owner")
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

  const listingMode = normalizeListingMode(
    input.listingMode ||
      input.mode ||
      input.leasingType ||
      (listing?.listingModes?.longTerm === true &&
      listing?.listingModes?.shortTerm !== true
        ? "long_term"
        : listing?.listingModes?.shortTerm === true &&
            listing?.listingModes?.longTerm !== true
          ? "short_term"
          : ""),
  );

  return {
    cityId: cityDoc?._id || null,
    cityName: cityDoc?.name || input.cityName || input.city || "",
    citySlug: cityDoc?.slug || "",
    productType,
    spaceType,
    listingMode,
    pageType: input.pageType || input.sourcePage || "",
    sourceUrl: input.sourceUrl || input.sourceURL || input.path || "",
    listing: listing
      ? {
          _id: listing._id,
          name: listing.name,
          slug: listing.slug,
          spaceType: listing.spaceType,
          listingModes: listing.listingModes || {},
          owner: listing.owner || null,
        }
      : null,
  };
}

function matchConsultant(consultant, context) {
  const cityId = idString(context.cityId);
  const listingId = idString(context.listing?._id);

  const assignedCityIds = (consultant.assignedCities || []).map(idString);
  const assignedProducts = consultant.assignedProductTypes || [];
  const assignedSpaces = consultant.assignedSpaceTypes || [];
  const assignedListingModes = consultant.assignedListingModes || [];
  const explicitListings = (consultant.visibilityRules?.listingIds || []).map(idString);

  const listingMatch = listingId && explicitListings.includes(listingId);
  const cityExact = cityId && assignedCityIds.includes(cityId);
  const productExact = isExactNormalized(assignedProducts, context.productType);
  const productWildcard = hasWildcard(assignedProducts);
  const productCompatible = includesNormalized(assignedProducts, context.productType);
  const spaceExact = isExactNormalized(assignedSpaces, context.spaceType);
  const spaceWildcard = hasWildcard(assignedSpaces);
  const spaceCompatible = includesNormalized(assignedSpaces, context.spaceType);
  const listingModeExact = isExactNormalized(
    assignedListingModes,
    context.listingMode,
    normalizeListingMode,
  );
  const listingModeWildcard = hasWildcard(assignedListingModes);
  const listingModeCompatible = includesListingMode(
    assignedListingModes,
    context.listingMode,
  );

  if (!productCompatible || !spaceCompatible || !listingModeCompatible) return null;

  let tier = 0;
  let confidence = "";
  let method = "";

  if (listingMatch) {
    tier = 4;
    confidence = "listing";
    method = "automated_listing";
  } else if (
    cityExact &&
    (context.productType ? productExact : productWildcard) &&
    (context.listingMode ? listingModeExact : listingModeWildcard)
  ) {
    tier = 3;
    confidence = "exact";
    method = "automated_exact";
  } else if (cityExact && consultant.visibilityRules?.cityFallback) {
    tier = 2;
    confidence = "city_fallback";
    method = "automated_city_fallback";
  } else if (consultant.visibilityRules?.globalFallback) {
    tier = 1;
    confidence = "global_fallback";
    method = "automated_global_fallback";
  }

  if (!tier) return null;

  const score =
    tier * 1000 +
    (productExact ? 100 : productWildcard ? 10 : 0) +
    (spaceExact ? 60 : spaceWildcard ? 6 : 0) +
    (listingModeExact ? 40 : listingModeWildcard ? 4 : 0) -
    Number(consultant.priority || 100) / 100;

  return { tier, score, confidence, method };
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

async function resolveConsultantImageUrl(consultant = {}) {
  const key = consultant.profileImage?.key || "";
  const fallbackUrl =
    consultant.profileImage?.url ||
    consultant.profileImageUrl ||
    "";

  if (!key) return fallbackUrl;

  return createSignedGetUrl({
    key,
    expiresSeconds: CONSULTANT_IMAGE_URL_TTL_SECONDS,
  }).catch(() => fallbackUrl);
}

export async function serializeConsultant(consultant, { publicView = true, match = null } = {}) {
  if (!consultant) return null;

  const imageUrl = await resolveConsultantImageUrl(consultant);

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
    profileImage: {
      ...(consultant.profileImage || {}),
      url: imageUrl,
    },
    assignedCities: consultant.assignedCities || [],
    assignedProductTypes: consultant.assignedProductTypes || [],
    assignedSpaceTypes: consultant.assignedSpaceTypes || [],
    assignedListingModes: consultant.assignedListingModes || [],
    leadRouting: consultant.leadRouting || {},
    routingStats: consultant.routingStats || {},
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
  const forAssignment = options.forAssignment === true;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (forAssignment) {
    await Consultant.updateMany(
      {
        $or: [
          { "routingStats.dailyAssignedDate": { $lt: todayStart } },
          {
            "routingStats.dailyAssignedDate": { $exists: false },
            "routingStats.dailyAssignedCount": { $gt: 0 },
          },
        ],
      },
      {
        $set: {
          "routingStats.dailyAssignedCount": 0,
          "routingStats.dailyAssignedDate": todayStart,
        },
      },
    );
  }

  const consultantFilter = {
    isActive: true,
    requestApprovalStatus: { $nin: ["pending", "rejected"] },
    "visibilityRules.hiddenFromPublic": { $ne: true },
    "leadRouting.enabled": { $ne: false },
    "leadRouting.receiveNewLeads": { $ne: false },
  };

  if (forAssignment) {
    consultantFilter["leadRouting.strategy"] = { $ne: "manual" };
  }

  const consultants = await Consultant.find(consultantFilter)
    .populate("assignedCities", "name slug")
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  const matches = consultants
    .map((consultant) => ({
      consultant,
      match: matchConsultant(consultant, context),
    }))
    .filter((entry) => {
      if (!entry.match) return false;
      if (!forAssignment) return true;

      const dailyCount = Number(entry.consultant.routingStats?.dailyAssignedCount || 0);
      const dailyLimit = Number(entry.consultant.leadRouting?.maxDailyLeads || 0);
      return !dailyLimit || dailyCount < dailyLimit;
    });

  const topTier = matches.reduce(
    (highest, entry) => Math.max(highest, entry.match.tier),
    0,
  );
  const topMatches = matches.filter((entry) => entry.match.tier === topTier);

  topMatches.sort((left, right) => {
    const leftWeight =
      left.consultant.leadRouting?.strategy === "weighted"
        ? Math.max(Number(left.consultant.leadRouting?.weight || 1), 0.1)
        : 1;
    const rightWeight =
      right.consultant.leadRouting?.strategy === "weighted"
        ? Math.max(Number(right.consultant.leadRouting?.weight || 1), 0.1)
        : 1;
    const leftLoad =
      Number(left.consultant.routingStats?.dailyAssignedCount || 0) / leftWeight;
    const rightLoad =
      Number(right.consultant.routingStats?.dailyAssignedCount || 0) / rightWeight;

    if (leftLoad !== rightLoad) return leftLoad - rightLoad;

    const leftAssigned = left.consultant.routingStats?.lastAssignedAt
      ? new Date(left.consultant.routingStats.lastAssignedAt).getTime()
      : 0;
    const rightAssigned = right.consultant.routingStats?.lastAssignedAt
      ? new Date(right.consultant.routingStats.lastAssignedAt).getTime()
      : 0;

    if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
    if (left.match.score !== right.match.score) return right.match.score - left.match.score;
    return Number(left.consultant.priority || 100) - Number(right.consultant.priority || 100);
  });

  const selected = topMatches[0] || null;
  const best = selected?.consultant || null;
  const bestMatch = selected?.match || null;

  return {
    consultant: await serializeConsultant(best, {
      publicView: options.publicView !== false,
      match: bestMatch,
    }),
    consultantDoc: best,
    context,
    match: bestMatch,
  };
}

export async function assignMatchingConsultant(input = {}) {
  const routed = await findMatchingConsultant(input, {
    publicView: false,
    forAssignment: true,
  });

  if (!routed.consultantDoc?._id) return routed;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dailyLimit = Number(routed.consultantDoc.leadRouting?.maxDailyLeads || 0);
  const updateFilter = {
    _id: routed.consultantDoc._id,
    isActive: true,
    "leadRouting.enabled": { $ne: false },
    "leadRouting.receiveNewLeads": { $ne: false },
  };

  if (dailyLimit) {
    updateFilter.$or = [
      { "routingStats.dailyAssignedCount": { $lt: dailyLimit } },
      { "routingStats.dailyAssignedCount": { $exists: false } },
    ];
  }

  const updated = await Consultant.findOneAndUpdate(
    updateFilter,
    {
      $inc: {
        "routingStats.totalAssigned": 1,
        "routingStats.dailyAssignedCount": 1,
      },
      $set: {
        "routingStats.dailyAssignedDate": todayStart,
        "routingStats.lastAssignedAt": now,
      },
    },
    { new: true },
  )
    .populate("assignedCities", "name slug")
    .lean();

  if (!updated) {
    return {
      ...routed,
      consultant: null,
      consultantDoc: null,
      match: null,
    };
  }

  return {
    ...routed,
    consultantDoc: updated,
    consultant: await serializeConsultant(updated, {
      publicView: false,
      match: routed.match,
    }),
  };
}

export async function releaseConsultantAssignment(consultantId) {
  if (!consultantId || !mongoose.Types.ObjectId.isValid(String(consultantId))) return;

  await Consultant.updateOne(
    { _id: consultantId },
    [
      {
        $set: {
          "routingStats.totalAssigned": {
            $max: [
              0,
              { $subtract: [{ $ifNull: ["$routingStats.totalAssigned", 0] }, 1] },
            ],
          },
          "routingStats.dailyAssignedCount": {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ["$routingStats.dailyAssignedCount", 0] },
                  1,
                ],
              },
            ],
          },
        },
      },
    ],
  );
}

export async function getConsultantForUser(userId) {
  if (!userId) return null;

  return Consultant.findOne({ linkedUser: userId })
    .populate("assignedCities", "name slug")
    .lean();
}
