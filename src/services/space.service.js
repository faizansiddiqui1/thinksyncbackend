// services/space.service.js
import slugify from "slugify";

import Space from "../models/admin_models/Space.js";
import SpaceMedia from "../models/admin_models/SpaceMedia.js";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Offer from "../models/admin_models/Offer.js";
import City from "../models/super_admin_models/City.model.js";
import VirtualOfficePlan from "../models/admin_models/VirtualOfficePlan.js";
import SeatingOption from "../models/admin_models/SeatingOption.js";

import { normalizePagination, metaFor } from "../utils/pagination.js";
import ResourceSchema from "../models/admin_models/ResourceSchema.js";
import mongoose from "mongoose";
import { forwardGeocode } from "./geocode.service.js";

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
  "centerDetails",
  "listingModes",
  "listingPrices",
  "pricingModel",
  "access24x7",
  "operatingHours",
  "powerBackup",
  "totalArea",
  "floorNumber",
  "privateOfficeDetails",
  "priceBreakup",
  "buildingInfo",
];

const isPlainObject = (v) =>
  v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

const isTrue = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

const prettify = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeSpaceType = (type) => {
  const value = String(type || "").toLowerCase();

  if (
    value === "coworking_space" ||
    value === "cowork_space" ||
    value === "coworking"
  ) {
    return "cowork_space";
  }

  if (value === "virtual_office" || value === "vertual_office") {
    return "virtual_office";
  }

  return value;
};

const pickLowestBy = (items, getValue) => {
  let best = null;
  let bestValue = Infinity;

  for (const item of items || []) {
    const value = getValue(item);

    if (typeof value !== "number" || Number.isNaN(value)) continue;

    if (value < bestValue) {
      best = item;
      bestValue = value;
    }
  }

  return best;
};

const groupBySpace = (items) => {
  const map = new Map();

  for (const item of items || []) {
    const key = String(item.space);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
  }

  return map;
};

const buildCityMap = async (items) => {
  const validObjectIds = [
    ...new Set(
      items
        .map((item) => item?.address?.city)
        .filter((city) => city && mongoose.Types.ObjectId.isValid(String(city)))
        .map(String),
    ),
  ];

  if (!validObjectIds.length) {
    return new Map();
  }

  const cities = await City.find({
    _id: { $in: validObjectIds },
  })
    .select("_id name slug")
    .lean()
    .exec();

  return new Map(cities.map((city) => [String(city._id), city]));
};
const buildVirtualOfficeSummary = (plans = []) => {
  const activePlans = plans.filter((p) => p.isActive !== false);

  const categories = [
    "gst_registration",
    "company_registration",
    "business_address",
  ];

  const categoryCards = categories.map((category) => {
    const categoryPlans = activePlans.filter((p) => p.category === category);
    const best = pickLowestBy(categoryPlans, (p) => p?.price?.monthly);

    return {
      category,
      label: prettify(category),
      title: best?.title || prettify(category),
      monthlyPrice: best?.price?.monthly ?? null,
      totalPrice: best?.price?.total ?? null,
      currency: best?.price?.currency || "INR",
      durationMonths: best?.durationMonths ?? null,
      popular: !!best?.popular,
      order: best?.order ?? 0,
      available: !!best,
    };
  });

  const startingFrom =
    pickLowestBy(categoryCards, (x) => x.monthlyPrice)?.monthlyPrice ?? null;

  return {
    categories: categoryCards,
    startingFrom,
    currency: "INR",
  };
};

const buildSeatingSummary = (seats = []) => {
  const activeSeats = seats.filter((s) => s.isActive !== false);
  const bestSeat = pickLowestBy(activeSeats, (s) => s?.pricing?.amount);

  const seatTypes = [
    ...new Map(
      activeSeats.map((seat) => {
        const key = seat.type;
        return [
          key,
          {
            type: key,
            label: prettify(key),
          },
        ];
      }),
    ).values(),
  ];

  return {
    seatTypes,
    startingFrom: bestSeat?.pricing?.amount ?? null,
    currency: bestSeat?.pricing?.currency || "INR",
    unit: bestSeat?.pricing?.unit || "per_desk",
    featuredSeat: bestSeat
      ? {
          _id: bestSeat._id,
          title: bestSeat.title,
          slug: bestSeat.slug,
          type: bestSeat.type,
          label: prettify(bestSeat.type),
          shortDescription: bestSeat.shortDescription || "",
          amount: bestSeat.pricing?.amount ?? null,
          currency: bestSeat.pricing?.currency || "INR",
          unit: bestSeat.pricing?.unit || "per_desk",
          image: bestSeat.images?.[0]?.url || null,
          availability: bestSeat.availability?.status || null,
          furnishing: bestSeat.furnishing || null,
        }
      : null,
  };
};

const buildResourceSummary = (resources = []) => {
  const activeResources = resources.filter((r) => r.isActive !== false);

  const normalized = [];

  for (const resource of activeResources) {
    const pricingCandidates = [
      { unit: "hourly", amount: resource.prices?.hourly },
      { unit: "daily", amount: resource.prices?.daily },
      { unit: "weekly", amount: resource.prices?.weekly },
      { unit: "monthly", amount: resource.prices?.monthly },
    ].filter((p) => typeof p.amount === "number" && Number.isFinite(p.amount));

    const cheapest = pickLowestBy(pricingCandidates, (p) => p.amount);

    if (!cheapest) continue;

    normalized.push({
      resourceId: resource._id,
      name: resource.name,
      type: resource.type,
      label: prettify(resource.type),
      amount: cheapest.amount,
      unit: cheapest.unit,
      currency: resource.currency || "INR",
      image: resource.images?.[0]?.url || null,
      capacity: resource.capacity || null,
      bookingRules: resource.bookingRules || null,
      displayOrder: resource.displayOrder ?? 0,
    });
  }

  const best = pickLowestBy(normalized, (x) => x.amount);

  const resourceTypes = [
    ...new Map(
      activeResources.map((r) => [
        r.type,
        {
          type: r.type,
          label: prettify(r.type),
        },
      ]),
    ).values(),
  ];

  return {
    resourceTypes,
    startingFrom: best?.amount ?? null,
    currency: best?.currency || "INR",
    unit: best?.unit || null,
    featuredResource: best || null,
  };
};

const buildPrivateOfficeSummary = (space) => {
  const details = space.privateOfficeDetails || {};
  const center = space.centerDetails || {};
  const priceBreakup = space.priceBreakup || {};

  const startingPrice =
    space.startingPrice ??
    priceBreakup.totalPerSqFt ??
    priceBreakup.rentPerSqFt ??
    null;

  return {
    startingPrice,
    currency: priceBreakup.currency || "INR",
    pricePerSqFt: priceBreakup.totalPerSqFt ?? null,
    rentPerSqFt: priceBreakup.rentPerSqFt ?? null,
    maintenancePerSqFt: priceBreakup.maintenancePerSqFt ?? null,
    totalCenterArea: center.totalCenterArea ?? null,
    totalSeats: center.totalSeats ?? null,
    totalBuildingFloors: center.totalBuildingFloors ?? null,
    typicalFloorplateArea: center.typicalFloorplateArea ?? null,
    floorSize: details.floorSize ?? null,
    floorConfiguration: details.floorConfiguration ?? null,
    buildingGrade: details.buildingGrade ?? null,
    lockInPeriodMonths: details.lockInPeriodMonths ?? null,
    securityDepositMonths: details.securityDepositMonths ?? null,
    noticePeriodMonths: details.noticePeriodMonths ?? null,
    furnishing: details.furnishing ?? null,
    possessionStatus: details.possessionStatus ?? null,
    availabilityStatus: details.availabilityStatus ?? null,
  };
};

const buildCardPayload = ({
  space,
  media,
  virtualOfficePlans,
  seatingOptions,
  resources,
}) => {
  const normalizedType = normalizeSpaceType(space.spaceType);

  const listingModes = space.listingModes || {};

  const isLongTerm = !!listingModes.longTerm;
  const isShortTerm = !!listingModes.shortTerm;

  const hasVirtualPlans =
    Array.isArray(virtualOfficePlans) && virtualOfficePlans.length > 0;

  const hasSeats = Array.isArray(seatingOptions) && seatingOptions.length > 0;

  const hasResources = Array.isArray(resources) && resources.length > 0;

  let cardVariant = "generic";
  let pricingSummary = null;

  // =====================================================
  // CARD TYPE + PRICING SUMMARY
  // =====================================================

  if (normalizedType === "virtual_office" || hasVirtualPlans) {
    cardVariant = "virtual_office";

    pricingSummary = buildVirtualOfficeSummary(virtualOfficePlans);
  } else if (normalizedType === "cowork_space") {
    if (isShortTerm) {
      cardVariant = "coworking_short_term";

      pricingSummary = buildResourceSummary(resources);
    } else {
      cardVariant = "coworking_long_term";

      pricingSummary = buildSeatingSummary(seatingOptions);
    }
  } else if (
    normalizedType === "private_office" ||
    normalizedType === "managed_office"
  ) {
    cardVariant = normalizedType;

    pricingSummary = buildPrivateOfficeSummary(space);
  } else {
    if (hasVirtualPlans) {
      cardVariant = "virtual_office";

      pricingSummary = buildVirtualOfficeSummary(virtualOfficePlans);
    } else if (isShortTerm && hasResources) {
      cardVariant = "coworking_short_term";

      pricingSummary = buildResourceSummary(resources);
    } else if (hasSeats) {
      cardVariant = "coworking_long_term";

      pricingSummary = buildSeatingSummary(seatingOptions);
    } else if (hasResources) {
      cardVariant = "coworking_short_term";

      pricingSummary = buildResourceSummary(resources);
    } else {
      cardVariant = normalizedType || "generic";

      pricingSummary = buildPrivateOfficeSummary(space);
    }
  }

  // =====================================================
  // LOCATION
  // =====================================================

  const cityLabel =
    space._cityDoc?.name ||
    space._cityDoc?.slug ||
    (typeof space.address?.city === "string" ? space.address.city : null);

  const street = space.address?.street?.trim() || "";

  const state = space.address?.state?.trim() || "";

  const country = space.address?.country?.trim() || "India";

  const pincode = space.address?.pincode?.trim() || "";

  const addressLine = [street, cityLabel].filter(Boolean).join(", ");

  const fullAddress = [street, cityLabel, state, pincode, country]
    .filter(Boolean)
    .join(", ");

  // =====================================================
  // GEO LOCATION
  // =====================================================

  const rawCoordinates = space.address?.location?.coordinates;

  const hasValidCoordinates =
    Array.isArray(rawCoordinates) &&
    rawCoordinates.length === 2 &&
    typeof rawCoordinates[0] === "number" &&
    typeof rawCoordinates[1] === "number";

  const longitude = hasValidCoordinates ? rawCoordinates[0] : null;

  const latitude = hasValidCoordinates ? rawCoordinates[1] : null;

  // =====================================================
  // MEDIA
  // =====================================================

  const images = Array.isArray(media?.images) ? media.images : [];

  const thumbnail = images?.[0]?.url || null;

  // =====================================================
  // RESPONSE
  // =====================================================

  return {
    _id: space._id,

    name: space.name,

    slug: space.slug,

    shortDescription: space.shortDescription || "",

    tagline: space.tagline || "",

    spaceType: space.spaceType,

    normalizedSpaceType: normalizedType,

    cardVariant,

    // =====================================================
    // LOCATION
    // =====================================================

    location: {
      cityId: space.address?.city || null,

      cityName: cityLabel,

      state,

      country,

      street,

      addressLine,

      fullAddress,

      pincode,

      latitude,

      longitude,

      coordinates:
        latitude != null && longitude != null
          ? {
              type: "Point",
              coordinates: [longitude, latitude],
            }
          : null,
    },

    // =====================================================
    // RATINGS
    // =====================================================

    isFeatured: !!space.isFeatured,

    averageRating: space.averageRating ?? 0,

    reviewCount: space.reviewCount ?? 0,

    // =====================================================
    // AMENITIES
    // =====================================================

    amenities: Array.isArray(space.amenities)
      ? space.amenities
          .filter(
            (amenity) =>
              amenity?.isHighlighted === true || amenity?.isPremium === true,
          )
          .filter(
            (item, index, self) =>
              index ===
              self.findIndex(
                (a) => a?.key === item?.key || a?.label === item?.label,
              ),
          )
      : [],

    // =====================================================
    // MEDIA
    // =====================================================

    images,

    thumbnail,

    video: media?.video || null,

    // =====================================================
    // PRICING
    // =====================================================

    pricingSummary,

    // =====================================================
    // CONFIG
    // =====================================================

    listingModes: space.listingModes || {},

    bookingRules: space.bookingRules || {},

    access24x7: !!space.access24x7,

    operatingHours: space.operatingHours || null,

    // =====================================================
    // DETAILS
    // =====================================================

    centerDetails: space.centerDetails || null,

    privateOfficeDetails: space.privateOfficeDetails || null,

    priceBreakup: space.priceBreakup || null,

    // =====================================================
    // TAXONOMY
    // =====================================================

    tags: Array.isArray(space.tags) ? space.tags : [],

    categories: Array.isArray(space.categories) ? space.categories : [],

    // =====================================================
    // CTA
    // =====================================================

    ctaLabel:
      cardVariant === "virtual_office"
        ? "Get Quote"
        : cardVariant === "coworking_long_term"
          ? "Get Best Price"
          : cardVariant === "coworking_short_term"
            ? "Book Now"
            : "View Details",
  };
};

// ===================================================
// Create Spaces
// ===================================================
export const createSpace = async (spaceData, userId = null, tenant = null) => {
  try {
    if (!userId) {
      throw new Error("User id required to create space");
    }

    spaceData.owner = userId;

    const coords = spaceData?.address?.location?.coordinates;

    if (
      !Array.isArray(coords) ||
      coords.length !== 2 ||
      !Number.isFinite(coords[0]) ||
      !Number.isFinite(coords[1]) ||
      (coords[0] === 0 && coords[1] === 0)
    ) {
      delete spaceData.address.location;
    }

    let cityName = "";

    if (spaceData?.address?.city) {
      const cityDoc = await City.findById(spaceData.address.city)
        .select("name")
        .lean();

      cityName = cityDoc?.name || "";
    }

    const addressParts = [
      spaceData?.address?.street,
      cityName,
      spaceData?.address?.state,
      spaceData?.address?.pincode,
      spaceData?.address?.country || "India",
    ].filter(Boolean);

    const fullAddress = addressParts.join(", ");

    try {
      const geo = await forwardGeocode(fullAddress, { tenant });

      if (geo?.lat != null && geo?.lng != null) {
        spaceData.address.location = {
          type: "Point",
          coordinates: [geo.lng, geo.lat],
        };
      }
    } catch (geoErr) {
      console.error("[GEOCODE ERROR]", geoErr.message);
    }

    const space = new Space(spaceData);

    await space.save();

    return space;
  } catch (error) {
    console.error("[serviceCreateSpace]", error);
    throw error;
  }
};

// ===================================================
// Get all Spaces (admin/public listing)
// ===================================================
export const getAllSpaces = async (rawQuery = {}, options = {}) => {
  const { page, limit, skip } = normalizePagination(options);
  const sort = options.sort || { createdAt: -1 };

  const q = {};

  if (options.ownerId) {
    q.owner = options.ownerId;

    if (rawQuery.status === "DRAFT") {
      q.isPublished = false;
    } else if (rawQuery.status === "PUBLISHED") {
      q.isPublished = true;
    }
  } else {
    q.isPublished = true;
  }

  if (rawQuery.city) q["address.city"] = String(rawQuery.city);
  if (rawQuery.spaceType) q.spaceType = String(rawQuery.spaceType);
  if (rawQuery.featured === "true" || rawQuery.featured === true)
    q.isFeatured = true;

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

// ===================================================
// Update Space
// ===================================================
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

// ===================================================
// Delete Space
// ===================================================
export const deleteSpace = async (id) => {
  const space = await Space.findByIdAndDelete(id).exec();
  if (!space) throw new Error("Space not found");
  return space;
};

// ===================================================
// USER SIDE LISTING
// ===================================================
const SPACE_TYPE_QUERY_MAP = {
  coworking: ["cowork_space", "coworking_space"],
  coworking_space: ["cowork_space", "coworking_space"],
  cowork_space: ["cowork_space", "coworking_space"],

  managed_office: ["managed_office"],
  private_office: ["private_office"],

  virtual_office: ["virtual_office", "vertual_office"],
  vertual_office: ["virtual_office", "vertual_office"],
};

export const fetchSpacesListing = async (rawQuery = {}) => {
  const page = Math.max(parseInt(rawQuery.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(rawQuery.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  let sort = { createdAt: -1 };

  switch (rawQuery.sort) {
    case "price_low":
      sort = { startingPrice: 1 };
      break;

    case "price_high":
      sort = { startingPrice: -1 };
      break;

    case "rating":
      sort = { averageRating: -1 };
      break;

    case "featured":
      sort = { isFeatured: -1 };
      break;

    case "newest":
    default:
      sort = { createdAt: -1 };
  }

  const q = {
    isPublished: true,
  };

  const requestedSpaceType = rawQuery.spaceType
    ? String(rawQuery.spaceType).toLowerCase()
    : null;

  if (isTrue(rawQuery.longTerm)) {
    q["listingModes.longTerm"] = true;
  }

  if (isTrue(rawQuery.shortTerm)) {
    q["listingModes.shortTerm"] = true;
  }

  if (rawQuery.city) {
    const cityDoc = await City.findOne({
      slug: String(rawQuery.city).toLowerCase(),
      isActive: true,
    })
      .select("_id")
      .lean()
      .exec();

    if (!cityDoc) {
      return {
        items: [],
        meta: metaFor(0, page, limit),
      };
    }

    q["address.city"] = cityDoc._id;
  }

  if (requestedSpaceType) {
    const mappedTypes = SPACE_TYPE_QUERY_MAP[requestedSpaceType];

    if (!mappedTypes) {
      return {
        items: [],
        meta: metaFor(0, page, limit),
      };
    }

    q.spaceType = { $in: mappedTypes };
  }

  if (isTrue(rawQuery.featured)) {
    q.isFeatured = true;
  }

  if (rawQuery.search) {
    const s = String(rawQuery.search);
    q.$or = [
      { name: { $regex: s, $options: "i" } },
      { tagline: { $regex: s, $options: "i" } },
      { shortDescription: { $regex: s, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Space.find(q)
      .select(
        [
          "name",
          "slug",
          "shortDescription",
          "tagline",
          "spaceType",
          "address",
          "averageRating",
          "reviewCount",
          "isFeatured",
          "amenities",
          "listingModes",
          "privateOfficeDetails",
          "centerDetails",
          "priceBreakup",
          "bookingRules",
          "access24x7",
          "operatingHours",
          "categories",
          "tags",
          "startingPrice",
        ].join(" "),
      )
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),

    Space.countDocuments(q).exec(),
  ]);

  if (!items.length) {
    return {
      items: [],
      meta: metaFor(total, page, limit),
    };
  }

  const ids = items.map((s) => s._id);
  const cityMap = await buildCityMap(items);

  const [medias, virtualOfficePlans, seatingOptions, resources] =
    await Promise.all([
      SpaceMedia.find({ space: { $in: ids } })
        .select("space images video")
        .lean()
        .exec(),

      VirtualOfficePlan.find({
        space: { $in: ids },
        isActive: true,
      })
        .lean()
        .exec(),

      SeatingOption.find({
        space: { $in: ids },
        isActive: true,
      })
        .lean()
        .exec(),

      ResourceSchema.find({
        space: { $in: ids },
        isActive: true,
      })
        .lean()
        .exec(),
    ]);

  const mediaMap = new Map(medias.map((m) => [String(m.space), m]));
  const virtualOfficeMap = groupBySpace(virtualOfficePlans);
  const seatingOptionsMap = groupBySpace(seatingOptions);
  const resourceMap = groupBySpace(resources);

  const itemsWithData = items.map((space) => {
    const id = String(space._id);

    const cityDoc = cityMap.get(String(space.address?.city)) || null;
    const media = mediaMap.get(id) || { images: [], video: null };
    const virtualPlans = virtualOfficeMap.get(id) || [];
    const seats = seatingOptionsMap.get(id) || [];
    const bookableResources = resourceMap.get(id) || [];

    return buildCardPayload({
      space: {
        ...space,
        _cityDoc: cityDoc,
      },
      media,
      virtualOfficePlans: virtualPlans,
      seatingOptions: seats,
      resources: bookableResources,
    });
  });

  return {
    items: itemsWithData,
    meta: metaFor(total, page, limit),
  };
};

// ===================================================
// FETCH SPACE DETAILS BY SLUG
// ===================================================
export const fetchSpaceDetailsBySlug = async (slug) => {
  try {
    if (!slug) {
      throw new Error("Slug is required");
    }

    const spaceDoc = await Space.findOne({
      slug,
      isPublished: true,
    })
      .populate("address.city", "name slug")
      .lean()
      .exec();

    if (!spaceDoc) {
      throw new Error("Space not found");
    }

    const spaceId = spaceDoc._id;

    const [
      resources,
      pricingPlans,
      offers,
      media,
      virtualOfficePlans,
      seatingOptions,
    ] = await Promise.all([
      ResourceSchema.find({
        space: spaceId,
      })
        .lean()
        .exec(),

      PricingPlan.find({
        space: spaceId,
      })
        .lean()
        .exec(),

      Offer.find({
        space: spaceId,
      })
        .lean()
        .exec(),

      SpaceMedia.findOne({
        space: spaceId,
      })
        .select("images video")
        .lean()
        .exec(),

      VirtualOfficePlan.find({
        space: spaceId,
        isActive: true,
      })
        .sort({
          category: 1,
          order: 1,
          durationMonths: 1,
        })
        .lean()
        .exec(),

      SeatingOption.find({
        space: spaceId,
        isActive: true,
      })
        .sort({
          displayOrder: 1,
          createdAt: -1,
        })
        .lean()
        .exec(),
    ]);

    const normalizedMedia = media || {
      images: [],
      video: null,
    };

    const pricingPlansSnapshot = pricingPlans.map((p) => ({
      ...p,
      priceSnapshot: p.price ?? p.amount ?? p.hourly ?? p.daily ?? null,
    }));

    const groupedVirtualOfficePlans = virtualOfficePlans.reduce((acc, plan) => {
      if (!acc[plan.category]) {
        acc[plan.category] = [];
      }

      acc[plan.category].push(plan);
      return acc;
    }, {});

    return {
      ...spaceDoc,
      resources: resources || [],
      pricingPlans: pricingPlansSnapshot || [],
      offers: offers || [],
      media: normalizedMedia,
      virtualOfficePlans: groupedVirtualOfficePlans || {},
      seatingOptions: seatingOptions || [],
    };
  } catch (error) {
    console.error("[fetchSpaceDetailsBySlug]", error);
    throw error;
  }
};
