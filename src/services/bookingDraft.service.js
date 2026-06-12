import crypto from "crypto";
import mongoose from "mongoose";
import BookingDraft from "../models/user_models/BookingDraft.js";
import Booking from "../models/user_models/Booking.js";
import TempBooking from "../models/user_models/TempBooking.js";
import Space from "../models/admin_models/Space.js";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import Addon from "../models/admin_models/AddonSchema.js";
import { validateOfferPreview } from "./offer.service.js";
import {
  createBooking,
  retryBookingPaymentSession,
} from "./booking.service.js";

const DEFAULT_DRAFT_TTL_HOURS = Math.max(
  1,
  Number(process.env.BOOKING_DRAFT_TTL_HOURS || 24),
);
const DEFAULT_GST_PERCENTAGE = 18;

function normalizeDraftStage(value = "checkout") {
  const stage = safeString(value || "checkout").toLowerCase();
  if (["cart", "availability", "checkout", "completed", "cancelled"].includes(stage)) {
    return stage;
  }
  return "checkout";
}

function normalizePlan(value = "daily") {
  const normalized = String(value || "daily").trim().toLowerCase();
  if (["hour", "hours", "hr", "hrs"].includes(normalized)) return "hourly";
  if (["day", "days"].includes(normalized)) return "daily";
  if (["week", "weeks"].includes(normalized)) return "weekly";
  if (["month", "months"].includes(normalized)) return "monthly";
  return normalized || "daily";
}

function buildDraftExpiryDate(baseDate = new Date()) {
  return new Date(baseDate.getTime() + DEFAULT_DRAFT_TTL_HOURS * 60 * 60 * 1000);
}

function safeString(value = "") {
  return String(value || "").trim();
}

function toPositiveNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : fallback;
}

function toInteger(value, fallback = 1) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.round(normalized));
}

function normalizeObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;
}

function bookingDraftScope({ userId = null, guestToken = null } = {}) {
  if (userId) {
    return { "owner.userId": normalizeObjectId(userId) };
  }

  if (guestToken) {
    return {
      "owner.userId": null,
      "owner.guestToken": safeString(guestToken),
    };
  }

  return null;
}

function buildValidationIssue(code, message, extra = {}) {
  return {
    code,
    message,
    severity: extra.severity || "error",
    blocking: extra.blocking !== false,
    field: extra.field || null,
    meta: extra.meta || null,
  };
}

function canRetryExistingBooking(booking = null) {
  return Boolean(
    booking &&
      booking.payment?.status !== "paid" &&
      ["draft", "pending_payment", "payment_processing"].includes(String(booking.status || "").toLowerCase()),
  );
}

function hasCheckoutSelection(materialized = {}) {
  return Boolean(
    materialized &&
      materialized.draftStage !== "cart" &&
      materialized?.space?.spaceId &&
      materialized?.selection?.startDateTime &&
      materialized?.selection?.endDateTime,
  );
}

function buildDraftMatchingSignature(source = {}) {
  const resources = Array.isArray(source?.resources) ? source.resources : [];
  const addons = Array.isArray(source?.addons) ? source.addons : [];
  const primaryItem = source?.selection?.primaryItem || null;

  return JSON.stringify({
    stage: normalizeDraftStage(source?.draftStage || source?.stage),
    purchaseIntent:
      safeString(source?.selection?.purchaseIntent || source?.purchaseIntent).toUpperCase() ===
      "PLAN_MEMBERSHIP"
        ? "PLAN_MEMBERSHIP"
        : "BOOKING",
    spaceId: String(source?.space?.spaceId || source?.spaceId || ""),
    bookingType: normalizePlan(source?.selection?.bookingType || source?.bookingType),
    startDateTime: source?.selection?.startDateTime
      ? new Date(source.selection.startDateTime).toISOString()
      : source?.startDateTime
        ? new Date(source.startDateTime).toISOString()
        : "",
    endDateTime: source?.selection?.endDateTime
      ? new Date(source.selection.endDateTime).toISOString()
      : source?.endDateTime
        ? new Date(source.endDateTime).toISOString()
        : "",
    primaryItem: {
      source: safeString(primaryItem?.source).toLowerCase(),
      id: String(primaryItem?.id || ""),
    },
    resources: resources
      .map((item) => ({
        id: String(item?.resourceId || item?.id || ""),
        qty: toInteger(item?.quantity || item?.qty, 1),
      }))
      .sort((left, right) => `${left.id}:${left.qty}`.localeCompare(`${right.id}:${right.qty}`)),
    addons: addons
      .map((item) => ({
        id: String(item?.addonId || item?.id || ""),
        qty: toInteger(item?.quantity || item?.qty, 1),
      }))
      .sort((left, right) => `${left.id}:${left.qty}`.localeCompare(`${right.id}:${right.qty}`)),
  });
}

function isBlockingIssue(issue = {}) {
  return issue?.blocking !== false;
}

function buildGuestDraftToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeDraftLineItems(lineItems = []) {
  if (!Array.isArray(lineItems)) return [];

  return lineItems
    .map((line) => {
      const source = safeString(line?.source).toLowerCase();
      const refId = safeString(line?.refId || line?.id);
      if (!source || !refId) return null;

      return {
        id: refId,
        refId,
        source,
        name: safeString(line?.name || "Booking item"),
        type: safeString(line?.type || source),
        qty: toInteger(line?.qty, 1),
        unit: toPositiveNumber(line?.unit, 0),
        detail: safeString(line?.detail),
      };
    })
    .filter(Boolean);
}

function normalizeRequestedResources(resources = []) {
  if (!Array.isArray(resources)) return [];

  return resources
    .map((resource) => {
      const resourceId = normalizeObjectId(resource?.resourceId || resource?._id || resource?.id);
      if (!resourceId) return null;

      return {
        resourceId,
        name: safeString(resource?.name),
        type: safeString(resource?.type),
        quantity: toInteger(resource?.quantity || resource?.qty, 1),
        unitPriceSnapshot: toPositiveNumber(
          resource?.unitPriceSnapshot ?? resource?.unitPrice ?? resource?.price,
          0,
        ),
      };
    })
    .filter(Boolean);
}

function normalizeRequestedAddons(addons = []) {
  if (!Array.isArray(addons)) return [];

  return addons
    .map((addon) => {
      const addonId = normalizeObjectId(addon?.addonId || addon?._id || addon?.id);
      if (!addonId) return null;

      return {
        addonId,
        name: safeString(addon?.name || addon?.title),
        type: safeString(addon?.type),
        quantity: toInteger(addon?.quantity || addon?.qty, 1),
        unitPriceSnapshot: toPositiveNumber(
          addon?.unitPriceSnapshot ?? addon?.unitPrice ?? addon?.price,
          0,
        ),
      };
    })
    .filter(Boolean);
}

function normalizeChargeLines(chargeLines = []) {
  if (!Array.isArray(chargeLines)) return [];

  return chargeLines
    .map((line) => {
      const planType = normalizePlan(line?.planType);
      const units = toInteger(line?.units, 1);

      return {
        ...line,
        planType,
        units,
        label: safeString(line?.label || `${units} ${planType}`),
      };
    })
    .filter(Boolean);
}

async function loadCatalogMaps({ spaceId, resources = [], addons = [] }) {
  const [space, catalogResources, catalogAddons] = await Promise.all([
    Space.findById(spaceId).select("_id name slug spaceType listingPrices isPublished"),
    Resource.find({
      _id: { $in: resources.map((item) => item.resourceId) },
      space: spaceId,
    }).lean(),
    Addon.find({
      _id: { $in: addons.map((item) => item.addonId) },
      space: spaceId,
    }).lean(),
  ]);

  return {
    space,
    resourceMap: new Map(catalogResources.map((item) => [String(item._id), item])),
    addonMap: new Map(catalogAddons.map((item) => [String(item._id), item])),
  };
}

async function resolvePricingPlan(spaceId, planId) {
  const normalizedPlanId = normalizeObjectId(planId);
  if (!normalizedPlanId) return null;

  return PricingPlan.findOne({
    _id: normalizedPlanId,
    space: spaceId,
    isActive: true,
  }).lean();
}

async function buildDraftMaterializedState(input = {}) {
  const issues = [];
  const draftStage = normalizeDraftStage(input?.draftStage || input?.stage);
  const spaceId = normalizeObjectId(input?.space?.spaceId || input?.spaceId);
  const bookingType = normalizePlan(input?.selection?.bookingType || input?.bookingType);
  const purchaseIntent =
    safeString(input?.selection?.purchaseIntent || input?.purchaseIntent).toUpperCase() ===
    "PLAN_MEMBERSHIP"
      ? "PLAN_MEMBERSHIP"
      : "BOOKING";
  const resources = normalizeRequestedResources(input?.resources);
  const addons = normalizeRequestedAddons(input?.addons);
  const lineItems = normalizeDraftLineItems(input?.pricingSummary?.lineItems || input?.lineItems);
  const chargeLines = normalizeChargeLines(input?.selection?.chargeLines || []);
  const couponCode = safeString(
    input?.pricingSummary?.couponCode || input?.couponCode,
  ).toUpperCase();
  const startDateTime = input?.selection?.startDateTime || input?.startDateTime || null;
  const endDateTime = input?.selection?.endDateTime || input?.endDateTime || null;
  const existingCheckoutBookingId = normalizeObjectId(
    input?.checkout?.bookingId || input?.checkoutBookingId || null,
  );

  if (!spaceId) {
    issues.push(
      buildValidationIssue(
        "space_missing",
        "A workspace must be selected before this draft can continue.",
        { field: "space", severity: "error" },
      ),
    );
  }

  const { space, resourceMap, addonMap } = spaceId
    ? await loadCatalogMaps({ spaceId, resources, addons })
    : { space: null, resourceMap: new Map(), addonMap: new Map() };

  if (!space || space.isPublished === false) {
    issues.push(
      buildValidationIssue(
        "space_unavailable",
        "This workspace is no longer available for checkout.",
        { field: "space", severity: "error" },
      ),
    );
  }

  const plan = await resolvePricingPlan(
    spaceId,
    input?.selection?.planId || input?.planId,
  );

  if (input?.selection?.planId && !plan) {
    issues.push(
      buildValidationIssue(
        "plan_unavailable",
        "The selected pricing plan is no longer available.",
        { field: "selection.planId", severity: "error" },
      ),
    );
  }

  const normalizedResources = resources.map((requested) => {
    const catalog = resourceMap.get(String(requested.resourceId));
    const unitPrice = toPositiveNumber(
      catalog?.prices?.[bookingType],
      requested.unitPriceSnapshot,
    );

    if (!catalog || catalog.isActive === false) {
      issues.push(
        buildValidationIssue(
          "resource_missing",
          `${requested.name || "A selected resource"} is no longer available.`,
          {
            field: "resources",
            meta: { resourceId: String(requested.resourceId) },
          },
        ),
      );
    } else if (!Number.isFinite(Number(catalog?.prices?.[bookingType]))) {
      issues.push(
        buildValidationIssue(
          "resource_price_missing",
          `${catalog.name || requested.name || "A resource"} no longer supports ${bookingType} booking.`,
          {
            field: "resources",
            meta: { resourceId: String(requested.resourceId), bookingType },
          },
        ),
      );
    }

    return {
      resourceId: requested.resourceId,
      name: safeString(catalog?.name || requested.name),
      type: safeString(catalog?.type || requested.type),
      quantity: requested.quantity,
      unitPriceSnapshot: unitPrice,
    };
  });

  const normalizedAddons = addons.map((requested) => {
    const catalog = addonMap.get(String(requested.addonId));
    const unitPrice = toPositiveNumber(catalog?.price, requested.unitPriceSnapshot);

    if (!catalog || catalog.isActive === false) {
      issues.push(
        buildValidationIssue(
          "addon_missing",
          `${requested.name || "A selected add-on"} is no longer available.`,
          {
            field: "addons",
            meta: { addonId: String(requested.addonId) },
          },
        ),
      );
    }

    if (
      catalog &&
      safeString(catalog?.type).toLowerCase() === "shop" &&
      catalog?.stock !== null &&
      catalog?.stock !== undefined &&
      requested.quantity > Number(catalog.stock || 0)
    ) {
      issues.push(
        buildValidationIssue(
          "addon_stock_exceeded",
          `${catalog.title || requested.name || "Selected add-on"} only has ${Number(
            catalog.stock || 0,
          )} item${Number(catalog.stock || 0) === 1 ? "" : "s"} left in stock.`,
          {
            field: "addons",
            meta: {
              addonId: String(requested.addonId),
              requestedQuantity: requested.quantity,
              availableStock: Number(catalog.stock || 0),
            },
          },
        ),
      );
    }

    return {
      addonId: requested.addonId,
      name: safeString(catalog?.title || requested.name),
      type: safeString(catalog?.type || requested.type),
      quantity: requested.quantity,
      unitPriceSnapshot: unitPrice,
    };
  });

  const normalizedLineItems = lineItems.map((line) => {
    let nextUnit = toPositiveNumber(line.unit, 0);

    if (line.source === "plan" && plan?.price != null) {
      nextUnit = toPositiveNumber(plan.price, nextUnit);
    }

    if (line.source === "resource") {
      const catalog = resourceMap.get(String(line.refId));
      if (catalog?.prices?.[bookingType] != null) {
        nextUnit = toPositiveNumber(catalog.prices[bookingType], nextUnit);
      }
    }

    if (line.source === "addon") {
      const catalog = addonMap.get(String(line.refId));
      if (catalog?.price != null) {
        nextUnit = toPositiveNumber(catalog.price, nextUnit);
      }
    }

    return {
      ...line,
      unit: nextUnit,
      total: Math.round(nextUnit * toInteger(line.qty, 1)),
    };
  });

  if (!normalizedLineItems.length) {
    issues.push(
      buildValidationIssue(
        "line_items_missing",
        "Add at least one bookable item before continuing to checkout.",
        { field: "pricingSummary.lineItems", severity: "error" },
      ),
    );
  }

  const requiresBookingWindow = draftStage !== "cart";

  if (requiresBookingWindow && (!startDateTime || !endDateTime)) {
    issues.push(
      buildValidationIssue(
        "time_range_missing",
        "Select a valid date and time range before continuing.",
        { field: "selection.startDateTime", severity: "error" },
      ),
    );
  }

  const normalizedStart = startDateTime ? new Date(startDateTime) : null;
  const normalizedEnd = endDateTime ? new Date(endDateTime) : null;

  if (
    requiresBookingWindow &&
    normalizedStart &&
    normalizedEnd &&
    (!Number.isFinite(normalizedStart.getTime()) ||
      !Number.isFinite(normalizedEnd.getTime()) ||
      normalizedEnd <= normalizedStart)
  ) {
    issues.push(
      buildValidationIssue(
        "time_range_invalid",
        "The selected booking window is invalid.",
        { field: "selection.endDateTime", severity: "error" },
      ),
    );
  }

  if (
    requiresBookingWindow &&
    normalizedStart &&
    normalizedEnd &&
    Number.isFinite(normalizedStart.getTime()) &&
    Number.isFinite(normalizedEnd.getTime())
  ) {
    for (const resource of normalizedResources) {
      const availability = await Booking.checkAvailability(
        resource.resourceId,
        normalizedStart,
        normalizedEnd,
        existingCheckoutBookingId || null,
      );

      if (!availability.available) {
        issues.push(
          buildValidationIssue(
            "resource_unavailable",
            `${resource.name || "A selected resource"} is no longer available for the chosen slot.`,
            {
              field: "resources",
              meta: { resourceId: String(resource.resourceId) },
            },
          ),
        );
      }
    }
  }

  const subtotal = normalizedLineItems.reduce(
    (sum, line) => sum + toPositiveNumber(line.total, 0),
    0,
  );
  const gstPercentage = toPositiveNumber(
    input?.pricingSummary?.gstPercentage,
    plan?.gstPercentage ?? DEFAULT_GST_PERCENTAGE,
  );
  const gstAmount = Math.round(subtotal * (gstPercentage / 100));
  let discount = 0;
  let totalAmount = Math.round(subtotal + gstAmount);
  let couponStatus = couponCode ? "invalid" : "none";

  if (couponCode && spaceId) {
    try {
      const offerResult = await validateOfferPreview({
        spaceId,
        code: couponCode,
        userId: input?.owner?.userId || input?.userId || null,
        planType: bookingType,
        bookingAmount: totalAmount,
      });

      discount = toPositiveNumber(offerResult?.discountAmount, 0);
      totalAmount = toPositiveNumber(offerResult?.finalAmount, totalAmount);
      couponStatus = "applied";
    } catch (error) {
      issues.push(
        buildValidationIssue(
          "coupon_invalid",
          error?.message || "The selected coupon is no longer valid.",
          { field: "pricingSummary.couponCode", severity: "warning", blocking: false },
        ),
      );
      couponStatus = "invalid";
    }
  }

  const priceChanged =
    input?.pricingSummary &&
    Number(input.pricingSummary.totalAmount || 0) > 0 &&
    Number(input.pricingSummary.totalAmount || 0) !== totalAmount;

  if (priceChanged) {
    issues.push(
      buildValidationIssue(
        "price_changed",
        "Pricing has changed since this draft was last saved. Review the updated total before paying.",
        {
          field: "pricingSummary.totalAmount",
          severity: "warning",
          blocking: false,
          meta: {
            previousTotal: Number(input?.pricingSummary?.totalAmount || 0),
            currentTotal: totalAmount,
          },
        },
      ),
    );
  }

  const validationState =
    !normalizedLineItems.length ||
    !spaceId ||
    (requiresBookingWindow && (!startDateTime || !endDateTime))
      ? "incomplete"
      : issues.some(isBlockingIssue)
      ? "invalid"
      : "valid";

  const requestedPrimaryItem = input?.selection?.primaryItem || input?.primaryItem || null;
  const requestedPrimaryId = safeString(
    requestedPrimaryItem?.id || requestedPrimaryItem?.resourceId || requestedPrimaryItem?.addonId,
  );
  const requestedPrimarySource = safeString(requestedPrimaryItem?.source).toLowerCase();

  const canonicalPrimaryResource =
    normalizedResources.find(
      (resource) => String(resource?.resourceId || "") === String(requestedPrimaryId || ""),
    ) || normalizedResources[0] || null;
  const canonicalPrimaryAddon =
    normalizedAddons.find(
      (addon) => String(addon?.addonId || "") === String(requestedPrimaryId || ""),
    ) || normalizedAddons[0] || null;

  let canonicalPrimaryItem = requestedPrimaryItem || null;

  if (purchaseIntent === "PLAN_MEMBERSHIP") {
    canonicalPrimaryItem = {
      id: String(plan?._id || normalizeObjectId(input?.selection?.planId || input?.planId) || ""),
      source: "plan",
      name:
        safeString(requestedPrimaryItem?.name) ||
        safeString(plan?.name) ||
        `${bookingType} plan`,
      type: bookingType,
      qty: Math.max(1, toInteger(requestedPrimaryItem?.qty, 1)),
      unitPrice: toPositiveNumber(plan?.price, requestedPrimaryItem?.unitPrice),
    };
  } else if (requestedPrimarySource === "addon" && canonicalPrimaryAddon) {
    canonicalPrimaryItem = {
      id: String(canonicalPrimaryAddon.addonId),
      source: "addon",
      name: safeString(canonicalPrimaryAddon.name || requestedPrimaryItem?.name),
      type: safeString(canonicalPrimaryAddon.type || requestedPrimaryItem?.type),
      qty: Math.max(1, toInteger(canonicalPrimaryAddon.quantity, 1)),
      unitPrice: toPositiveNumber(
        canonicalPrimaryAddon.unitPriceSnapshot,
        requestedPrimaryItem?.unitPrice,
      ),
    };
  } else if (canonicalPrimaryResource) {
    canonicalPrimaryItem = {
      id: String(canonicalPrimaryResource.resourceId),
      source: "resource",
      name: safeString(canonicalPrimaryResource.name || requestedPrimaryItem?.name),
      type: safeString(canonicalPrimaryResource.type || requestedPrimaryItem?.type),
      qty: Math.max(1, toInteger(canonicalPrimaryResource.quantity, 1)),
      unitPrice: toPositiveNumber(
        canonicalPrimaryResource.unitPriceSnapshot,
        requestedPrimaryItem?.unitPrice,
      ),
    };
  } else if (canonicalPrimaryAddon) {
    canonicalPrimaryItem = {
      id: String(canonicalPrimaryAddon.addonId),
      source: "addon",
      name: safeString(canonicalPrimaryAddon.name || requestedPrimaryItem?.name),
      type: safeString(canonicalPrimaryAddon.type || requestedPrimaryItem?.type),
      qty: Math.max(1, toInteger(canonicalPrimaryAddon.quantity, 1)),
      unitPrice: toPositiveNumber(
        canonicalPrimaryAddon.unitPriceSnapshot,
        requestedPrimaryItem?.unitPrice,
      ),
    };
  }

  return {
    draftStage,
    space: {
      spaceId,
      slug: safeString(input?.space?.slug || space?.slug),
      name: safeString(input?.space?.name || space?.name),
      spaceType: safeString(input?.space?.spaceType || space?.spaceType),
    },
    selection: {
      bookingType,
      durationCount: toInteger(input?.selection?.durationCount, 1),
      timezone: safeString(input?.selection?.timezone || input?.timezone || "Asia/Kolkata"),
      startDateTime: normalizedStart && Number.isFinite(normalizedStart.getTime()) ? normalizedStart : null,
      endDateTime: normalizedEnd && Number.isFinite(normalizedEnd.getTime()) ? normalizedEnd : null,
      selectedDateKeys: Array.isArray(input?.selection?.selectedDateKeys)
        ? input.selection.selectedDateKeys.filter(Boolean)
        : [],
      selectedSlots: Array.isArray(input?.selection?.selectedSlots)
        ? input.selection.selectedSlots
        : [],
      bookingSegments: Array.isArray(input?.selection?.bookingSegments)
        ? input.selection.bookingSegments
        : [],
      chargeLines,
      planId: plan?._id || normalizeObjectId(input?.selection?.planId || input?.planId),
      purchaseIntent,
      primaryItem: canonicalPrimaryItem,
    },
    resources: normalizedResources,
    addons: normalizedAddons,
    pricingSummary: {
      basePrice: subtotal,
      gstPercentage,
      gstAmount,
      discount,
      totalAmount,
      couponCode,
      couponStatus,
      lineItems: normalizedLineItems,
      currency: safeString(input?.pricingSummary?.currency || "INR") || "INR",
    },
    specialRequests: safeString(input?.specialRequests),
    validation: {
      state: validationState,
      issues,
      validatedAt: new Date(),
    },
  };
}

function serializeDraftDocument(draft) {
  const doc = draft?.toObject ? draft.toObject() : draft;
  if (!doc) return null;

  return {
    ...doc,
    id: String(doc._id),
  };
}

async function adoptResumableCheckoutBooking(draft) {
  if (!draft?.owner?.userId || !hasCheckoutSelection(draft)) {
    return null;
  }

  const draftSignature = buildDraftMatchingSignature(draft);

  const candidates = await Booking.find({
    "user.userId": normalizeObjectId(draft.owner.userId),
    space: normalizeObjectId(draft?.space?.spaceId),
    bookingType: normalizePlan(draft?.selection?.bookingType),
    purchaseIntent:
      draft?.selection?.purchaseIntent === "PLAN_MEMBERSHIP" ? "PLAN_MEMBERSHIP" : "BOOKING",
    startDateTime: new Date(draft.selection.startDateTime),
    endDateTime: new Date(draft.selection.endDateTime),
    status: {
      $in: ["draft", "pending_payment", "payment_processing"],
    },
  }).sort({ updatedAt: -1, createdAt: -1 });

  const matchingBooking =
    candidates.find((booking) => {
      if (!canRetryExistingBooking(booking)) return false;
      return buildDraftMatchingSignature({
        draftStage: "checkout",
        space: {
          spaceId: booking.space,
        },
        selection: {
          bookingType: booking.bookingType,
          startDateTime: booking.startDateTime,
          endDateTime: booking.endDateTime,
          purchaseIntent: booking.purchaseIntent || "BOOKING",
          primaryItem:
            Array.isArray(booking.resources) && booking.resources[0]
              ? {
                  source: "resource",
                  id: String(booking.resources[0].resourceId || ""),
                }
              : null,
        },
        resources: booking.resources || [],
        addons: booking.addons || [],
      }) === draftSignature;
    }) || null;

  if (!matchingBooking) {
    return null;
  }

  const bookingId = String(matchingBooking._id || "");
  const currentBookingId = String(draft?.checkout?.bookingId || "");

  if (currentBookingId === bookingId) {
    return matchingBooking;
  }

  draft.checkout = {
    ...(draft.checkout?.toObject ? draft.checkout.toObject() : draft.checkout || {}),
    bookingId: matchingBooking._id,
    gateway: safeString(matchingBooking?.payment?.gateway),
    paymentMethod:
      safeString(draft?.checkout?.paymentMethod || matchingBooking?.payment?.method || "upi") || "upi",
    paymentStatus: safeString(matchingBooking?.payment?.status || draft?.checkout?.paymentStatus || "pending"),
    lastPreparedAt: matchingBooking.updatedAt || new Date(),
  };
  draft.lastActivityAt = new Date();
  await draft.save();

  if (String(matchingBooking?.sourceDraftId || "") !== String(draft?._id || "")) {
    matchingBooking.sourceDraftId = draft._id;
    await matchingBooking.save();
    await TempBooking.updateMany(
      {
        bookingId: matchingBooking._id,
      },
      {
        $set: {
          draftId: draft._id,
        },
      },
    );
  }

  return matchingBooking;
}

async function hydrateDraftResponse(draft) {
  if (draft?.owner?.userId) {
    await adoptResumableCheckoutBooking(draft);
  }

  const serialized = serializeDraftDocument(draft);
  if (!serialized) return null;

  const liveState = await buildDraftMaterializedState(serialized);

  return {
    ...serialized,
    livePricingSummary: liveState.pricingSummary,
    validation: liveState.validation,
    draftStage: liveState.draftStage || serialized.draftStage || "checkout",
  };
}

export function createGuestBookingDraftToken() {
  return buildGuestDraftToken();
}

export async function claimGuestBookingDraftsForUser({ guestToken, userId }) {
  const normalizedGuestToken = safeString(guestToken);
  const normalizedUserId = normalizeObjectId(userId);

  if (!normalizedGuestToken || !normalizedUserId) {
    return { updatedCount: 0 };
  }

  const result = await BookingDraft.updateMany(
    {
      "owner.guestToken": normalizedGuestToken,
      "owner.userId": null,
    },
    {
      $set: {
        "owner.userId": normalizedUserId,
        lastActivityAt: new Date(),
      },
    },
  );

  return {
    updatedCount: Number(result.modifiedCount || 0),
  };
}

export async function listBookingDraftsForActor(
  actor,
  { status = "active", limit = 10, page = 1, draftStage = "", focusId = "" } = {},
) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return {
      success: true,
      data: {
        drafts: [],
        pagination: {
          page: 1,
          limit: Math.max(1, Math.min(50, Number(limit || 10))),
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    };
  }

  const normalizedLimit = Math.max(1, Math.min(50, Number(limit || 10)));
  let resolvedPage = Math.max(1, Number(page || 1));
  const baseQuery = {
    ...scope,
    ...(status ? { status } : {}),
    ...(draftStage ? { draftStage: normalizeDraftStage(draftStage) } : {}),
  };

  if (focusId && mongoose.Types.ObjectId.isValid(focusId)) {
    const orderedIds = await BookingDraft.find(baseQuery)
      .sort({ lastActivityAt: -1, updatedAt: -1 })
      .select("_id")
      .lean();
    const focusedIndex = orderedIds.findIndex(
      (item) => String(item?._id || "") === String(focusId),
    );
    if (focusedIndex >= 0) {
      resolvedPage = Math.max(1, Math.floor(focusedIndex / normalizedLimit) + 1);
    }
  }

  const total = await BookingDraft.countDocuments(baseQuery);
  const totalPages = Math.max(1, Math.ceil(total / normalizedLimit) || 1);
  if (resolvedPage > totalPages) {
    resolvedPage = totalPages;
  }

  const drafts = await BookingDraft.find(baseQuery)
    .sort({ lastActivityAt: -1, updatedAt: -1 })
    .skip((resolvedPage - 1) * normalizedLimit)
    .limit(normalizedLimit)
    .lean();

  return {
    success: true,
    data: {
      drafts,
      pagination: {
        page: resolvedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNextPage: resolvedPage < totalPages,
        hasPrevPage: resolvedPage > 1,
      },
    },
  };
}

export async function getMostRecentActiveBookingDraft(actor, { draftStage = "checkout" } = {}) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return { success: true, data: { draft: null } };
  }

  const draft = await BookingDraft.findOne({
    ...scope,
    status: "active",
    ...(draftStage ? { draftStage: normalizeDraftStage(draftStage) } : {}),
  }).sort({ lastActivityAt: -1, updatedAt: -1 });

  return {
    success: true,
    data: {
      draft: draft ? await hydrateDraftResponse(draft) : null,
    },
  };
}

export async function getBookingDraftById(draftId, actor) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return { success: false, error: "Draft access is not available" };
  }

  const draft = await BookingDraft.findOne({
    _id: draftId,
    ...scope,
  });

  if (!draft) {
    return { success: false, error: "Booking draft not found" };
  }

  return {
    success: true,
    data: {
      draft: await hydrateDraftResponse(draft),
    },
  };
}

export async function createBookingDraftForActor(actor, payload = {}) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return { success: false, error: "Draft access is not available" };
  }

  const materialized = await buildDraftMaterializedState({
    ...payload,
    owner: actor,
  });
  const now = new Date();

  if (hasCheckoutSelection(materialized)) {
    const activeDrafts = await BookingDraft.find({
      ...scope,
      status: "active",
      draftStage: materialized.draftStage,
      "space.spaceId": materialized?.space?.spaceId,
    }).sort({ lastActivityAt: -1, updatedAt: -1 });

    const reusableDraft =
      activeDrafts.find(
        (existingDraft) =>
          buildDraftMatchingSignature(existingDraft) === buildDraftMatchingSignature(materialized),
      ) || null;

    if (reusableDraft) {
      reusableDraft.space = materialized.space;
      reusableDraft.selection = materialized.selection;
      reusableDraft.resources = materialized.resources;
      reusableDraft.addons = materialized.addons;
      reusableDraft.pricingSummary = materialized.pricingSummary;
      reusableDraft.specialRequests = materialized.specialRequests;
      reusableDraft.validation = materialized.validation;
      reusableDraft.checkout = {
        ...(reusableDraft.checkout?.toObject ? reusableDraft.checkout.toObject() : reusableDraft.checkout || {}),
        paymentMethod:
          safeString(payload?.checkout?.paymentMethod || payload?.paymentMethod || reusableDraft.checkout?.paymentMethod || "upi") || "upi",
      };
      reusableDraft.lastActivityAt = now;
      reusableDraft.expiresAt = buildDraftExpiryDate(now);
      reusableDraft.sourceRoute = safeString(payload?.sourceRoute || reusableDraft.sourceRoute);
      reusableDraft.version = Number(reusableDraft.version || 0) + 1;
      await reusableDraft.save();

      return {
        success: true,
        data: {
          draft: await hydrateDraftResponse(reusableDraft),
        },
      };
    }
  }

  const draft = await BookingDraft.create({
    owner: {
      userId: actor?.userId ? normalizeObjectId(actor.userId) : null,
      guestToken: actor?.guestToken ? safeString(actor.guestToken) : null,
    },
    status: "active",
    draftStage: materialized.draftStage,
    space: materialized.space,
    selection: materialized.selection,
    resources: materialized.resources,
    addons: materialized.addons,
    pricingSummary: materialized.pricingSummary,
    specialRequests: materialized.specialRequests,
    validation: materialized.validation,
    checkout: {
      paymentMethod: safeString(payload?.checkout?.paymentMethod || payload?.paymentMethod || "upi") || "upi",
    },
    lastActivityAt: now,
    expiresAt: buildDraftExpiryDate(now),
    version: 1,
    sourceRoute: safeString(payload?.sourceRoute),
  });

  return {
    success: true,
    data: {
      draft: await hydrateDraftResponse(draft),
    },
  };
}

export async function updateBookingDraftForActor(
  draftId,
  actor,
  payload = {},
) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return { success: false, error: "Draft access is not available" };
  }

  const draft = await BookingDraft.findOne({
    _id: draftId,
    ...scope,
  });

  if (!draft) {
    return { success: false, error: "Booking draft not found" };
  }

  const expectedVersion = Number(payload?.version || 0);
  if (expectedVersion && expectedVersion !== Number(draft.version || 0)) {
    return {
      success: false,
      error: "Booking draft was updated in another tab",
      code: "DRAFT_VERSION_CONFLICT",
      data: {
        draft: await hydrateDraftResponse(draft),
      },
    };
  }

  const materialized = await buildDraftMaterializedState({
    ...serializeDraftDocument(draft),
    ...payload,
    space: payload?.space || draft.space,
    selection: {
      ...(draft.selection?.toObject ? draft.selection.toObject() : draft.selection || {}),
      ...(payload?.selection || {}),
    },
    resources: payload?.resources || draft.resources,
    addons: payload?.addons || draft.addons,
    pricingSummary: {
      ...(draft.pricingSummary?.toObject
        ? draft.pricingSummary.toObject()
        : draft.pricingSummary || {}),
      ...(payload?.pricingSummary || {}),
    },
    specialRequests:
      payload?.specialRequests !== undefined
        ? payload.specialRequests
        : draft.specialRequests,
    owner: actor,
  });
  const previousSignature = buildDraftMatchingSignature(draft);
  const nextSignature = buildDraftMatchingSignature(materialized);
  const bookingSelectionChanged = previousSignature !== nextSignature;

  draft.status = "active";
  draft.draftStage = materialized.draftStage;
  draft.space = materialized.space;
  draft.selection = materialized.selection;
  draft.resources = materialized.resources;
  draft.addons = materialized.addons;
  draft.pricingSummary = materialized.pricingSummary;
  draft.specialRequests = materialized.specialRequests;
  draft.validation = materialized.validation;
  const existingCheckout =
    draft.checkout?.toObject ? draft.checkout.toObject() : draft.checkout || {};
  draft.checkout = {
    ...(bookingSelectionChanged ? {} : existingCheckout),
    paymentMethod:
      safeString(payload?.checkout?.paymentMethod || payload?.paymentMethod || existingCheckout?.paymentMethod || "upi") || "upi",
  };
  draft.lastActivityAt = new Date();
  draft.expiresAt = buildDraftExpiryDate(draft.lastActivityAt);
  draft.sourceRoute = safeString(payload?.sourceRoute || draft.sourceRoute);
  draft.version = Number(draft.version || 0) + 1;

  await draft.save();

  return {
    success: true,
    data: {
      draft: await hydrateDraftResponse(draft),
    },
  };
}

export async function cancelBookingDraftForActor(
  draftId,
  actor,
  reason = "cancelled_by_user",
) {
  const scope = bookingDraftScope(actor);
  if (!scope) {
    return { success: false, error: "Draft access is not available" };
  }

  const draft = await BookingDraft.findOne({
    _id: draftId,
    ...scope,
  });

  if (!draft) {
    return { success: false, error: "Booking draft not found" };
  }

  draft.status = "cancelled";
  draft.draftStage = "cancelled";
  draft.cancelledAt = new Date();
  draft.cancelReason = safeString(reason || "cancelled_by_user");
  draft.version = Number(draft.version || 0) + 1;

  await draft.save();

  return {
    success: true,
    data: {
      draft: serializeDraftDocument(draft),
    },
  };
}

function buildCheckoutBookingPayload(draft, userId, paymentMethod, specialRequests) {
  const spaceId = draft?.space?.spaceId || draft?.space?._id || null;
  const bookingType = normalizePlan(draft?.selection?.bookingType);
  const resources = Array.isArray(draft?.resources) ? draft.resources : [];
  const addons = Array.isArray(draft?.addons) ? draft.addons : [];
  const planId = draft?.selection?.planId || draft?.planId || null;
  const pricingSummary = draft?.livePricingSummary || draft?.pricingSummary || {};
  const primaryResourceId = safeString(
    draft?.selection?.primaryItem?.source === "resource"
      ? draft?.selection?.primaryItem?.id
      : draft?.resources?.[0]?.resourceId,
  );
  const orderedResources = [...resources].sort((left, right) => {
    const leftIsPrimary = String(left?.resourceId || "") === primaryResourceId;
    const rightIsPrimary = String(right?.resourceId || "") === primaryResourceId;
    if (leftIsPrimary === rightIsPrimary) return 0;
    return leftIsPrimary ? -1 : 1;
  });

  return {
    userId,
    sourceDraftId: draft?._id,
    space: spaceId,
    spaceType: draft?.space?.spaceType || "",
    bookingType,
    plan: {
      planId: planId || null,
      type: bookingType,
    },
    resources: orderedResources.map((item) => ({
      resourceId: item.resourceId,
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
    })),
    addons: addons.map((item) => ({
      addonId: item.addonId,
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
    })),
    bookingDuration: {
      startDate: draft?.selection?.startDateTime,
      endDate: draft?.selection?.endDateTime,
      totalDays: draft?.selection?.durationCount || 1,
    },
    startDateTime: draft?.selection?.startDateTime,
    endDateTime: draft?.selection?.endDateTime,
    bookingSegments: draft?.selection?.bookingSegments || [],
    timezone: draft?.selection?.timezone || "Asia/Kolkata",
    specialRequests:
      specialRequests !== undefined ? safeString(specialRequests) : safeString(draft?.specialRequests),
    payment: {
      method: paymentMethod || draft?.checkout?.paymentMethod || "upi",
    },
    totalAmount: Number(pricingSummary?.totalAmount || 0),
    couponCode: safeString(pricingSummary?.couponCode).toUpperCase() || null,
    priceBreakdown: {
      basePrice: Number(pricingSummary?.basePrice || 0),
      gstPercentage: Number(pricingSummary?.gstPercentage || DEFAULT_GST_PERCENTAGE),
      gstAmount: Number(pricingSummary?.gstAmount || 0),
      discount: Number(pricingSummary?.discount || 0),
      totalAmount: Number(pricingSummary?.totalAmount || 0),
      currency: safeString(pricingSummary?.currency || "INR") || "INR",
    },
    purchaseIntent:
      draft?.selection?.purchaseIntent === "PLAN_MEMBERSHIP"
        ? "PLAN_MEMBERSHIP"
        : "BOOKING",
  };
}

export async function checkoutBookingDraftForUser(
  draftId,
  userId,
  payload = {},
) {
  const draft = await BookingDraft.findOne({
    _id: draftId,
    "owner.userId": normalizeObjectId(userId),
    status: "active",
  });

  if (!draft) {
    return { success: false, error: "Booking draft not found" };
  }

  const hydratedDraft = await hydrateDraftResponse(draft);
  const blockingIssues = (hydratedDraft?.validation?.issues || []).filter(isBlockingIssue);
  if (blockingIssues.length > 0) {
    return {
      success: false,
      error: "Booking draft needs review before checkout",
      code: "DRAFT_VALIDATION_FAILED",
      data: {
        draft: hydratedDraft,
        recovery: {
          action: "review_draft",
        },
      },
    };
  }

  const nextPaymentMethod =
    safeString(payload?.paymentMethod || payload?.payment?.method || draft.checkout?.paymentMethod || "upi") || "upi";
  const nextSpecialRequests =
    payload?.specialRequests !== undefined ? payload.specialRequests : draft.specialRequests;

  if (draft.checkout?.bookingId) {
    const linkedBooking = await Booking.findOne({
      _id: draft.checkout.bookingId,
      "user.userId": normalizeObjectId(userId),
    });

    if (linkedBooking?.payment?.status === "paid" || linkedBooking?.status === "confirmed") {
      draft.status = "completed";
      draft.draftStage = "completed";
      draft.completedAt = new Date();
      draft.checkout.paymentStatus = linkedBooking.payment?.status || "paid";
      draft.version = Number(draft.version || 0) + 1;
      await draft.save();

      return {
        success: true,
        data: {
          bookingId: linkedBooking._id,
          alreadyCompleted: true,
        },
      };
    }

    if (canRetryExistingBooking(linkedBooking)) {
      const retryResult = await retryBookingPaymentSession(userId, linkedBooking._id);
      if (retryResult.success) {
        draft.checkout.gateway = safeString(retryResult?.data?.gateway);
        draft.checkout.paymentMethod = nextPaymentMethod;
        draft.checkout.paymentStatus = "pending";
        draft.checkout.lastPreparedAt = new Date();
        draft.lastActivityAt = new Date();
        draft.version = Number(draft.version || 0) + 1;
        await draft.save();
      }
      return retryResult;
    }
  }

  draft.draftStage = "checkout";

  const bookingPayload = buildCheckoutBookingPayload(
    hydratedDraft,
    userId,
    nextPaymentMethod,
    nextSpecialRequests,
  );
  const createResult = await createBooking(bookingPayload);
  if (!createResult.success) {
    return createResult;
  }

  draft.checkout.bookingId = createResult?.data?.bookingId || null;
  draft.checkout.gateway = safeString(createResult?.data?.gateway);
  draft.checkout.paymentMethod = nextPaymentMethod;
  draft.checkout.paymentStatus = "pending";
  draft.checkout.lastPreparedAt = new Date();
  draft.specialRequests = safeString(nextSpecialRequests);
  draft.lastActivityAt = new Date();
  draft.version = Number(draft.version || 0) + 1;
  await draft.save();

  return createResult;
}

export async function markBookingDraftCompleted(sourceDraftId, paymentStatus = "paid") {
  const normalizedDraftId = normalizeObjectId(sourceDraftId);
  if (!normalizedDraftId) return null;

  return BookingDraft.findByIdAndUpdate(
    normalizedDraftId,
    {
      $set: {
        status: "completed",
        draftStage: "completed",
        completedAt: new Date(),
        "checkout.paymentStatus": paymentStatus,
        lastActivityAt: new Date(),
      },
      $inc: {
        version: 1,
      },
    },
    { new: true },
  );
}

export async function expireStaleBookingDrafts({ now = new Date(), batchSize = 100 } = {}) {
  const drafts = await BookingDraft.find({
    status: "active",
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1 })
    .limit(Math.max(1, batchSize));

  let expiredCount = 0;

  for (const draft of drafts) {
    draft.status = "expired";
    if (draft.draftStage !== "completed" && draft.draftStage !== "cancelled") {
      draft.draftStage = "cancelled";
    }
    draft.version = Number(draft.version || 0) + 1;
    await draft.save();
    expiredCount += 1;
  }

  return {
    scanned: drafts.length,
    expired: expiredCount,
  };
}
