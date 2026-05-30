import Space from "../models/admin_models/Space.js";
import EventSpace from "../models/admin_models/EventSpace.js";

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const toNullableNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const ensureSpaceExists = async (spaceId) => {
  const space = await Space.findById(spaceId).select("_id spaceType");

  if (!space) {
    const err = new Error("Space not found");
    err.status = 404;
    throw err;
  }

  return space;
};

const ensureEventSpaceExists = async (eventSpaceId) => {
  const eventSpace = await EventSpace.findById(eventSpaceId);

  if (!eventSpace) {
    const err = new Error("Event space details not found");
    err.status = 404;
    throw err;
  }

  return eventSpace;
};

const normalizePayload = (data = {}) => {
  const capacity = data.capacity || {};
  const pricing = data.pricing || {};
  const foodAndBeverage = data.foodAndBeverage || {};
  const bookingRules = data.bookingRules || {};

  const normalizedCapacity = {
    min: toNullableNumber(capacity.min) || 1,
    max: toNullableNumber(capacity.max) || toNullableNumber(capacity.min) || 1,
    seated: toNullableNumber(capacity.seated),
    standing: toNullableNumber(capacity.standing),
  };

  if (normalizedCapacity.max < normalizedCapacity.min) {
    normalizedCapacity.max = normalizedCapacity.min;
  }

  return {
    ...(data.space ? { space: data.space } : {}),
    ...(data.title !== undefined ? { title: String(data.title || "").trim() } : {}),
    eventTypes: toStringArray(data.eventTypes),
    layoutOptions: toStringArray(data.layoutOptions),
    capacity: normalizedCapacity,
    areaSqFt: toNullableNumber(data.areaSqFt),
    pricing: {
      hourly: toNullableNumber(pricing.hourly),
      halfDay: toNullableNumber(pricing.halfDay),
      fullDay: toNullableNumber(pricing.fullDay),
      daily: toNullableNumber(pricing.daily),
      currency: String(pricing.currency || "INR").trim(),
      minimumHours: toNullableNumber(pricing.minimumHours),
      isNegotiable:
        pricing.isNegotiable === undefined
          ? true
          : Boolean(pricing.isNegotiable),
    },
    availabilityStatus: [
      "available",
      "limited",
      "unavailable",
      "on_request",
    ].includes(data.availabilityStatus)
      ? data.availabilityStatus
      : "available",
    amenities: toStringArray(data.amenities),
    equipment: toStringArray(data.equipment),
    inclusions: toStringArray(data.inclusions),
    addOns: toStringArray(data.addOns),
    foodAndBeverage: {
      allowed:
        foodAndBeverage.allowed === undefined
          ? true
          : Boolean(foodAndBeverage.allowed),
      inHouseCatering: Boolean(foodAndBeverage.inHouseCatering),
      externalCatering:
        foodAndBeverage.externalCatering === undefined
          ? true
          : Boolean(foodAndBeverage.externalCatering),
      alcoholAllowed: Boolean(foodAndBeverage.alcoholAllowed),
    },
    bookingRules: {
      advanceNoticeHours:
        toNullableNumber(bookingRules.advanceNoticeHours) ?? 24,
      cancellationPolicy: String(bookingRules.cancellationPolicy || "").trim(),
      overtimeAllowed:
        bookingRules.overtimeAllowed === undefined
          ? true
          : Boolean(bookingRules.overtimeAllowed),
      setupTimeMinutes: toNullableNumber(bookingRules.setupTimeMinutes) ?? 0,
      cleanupTimeMinutes: toNullableNumber(bookingRules.cleanupTimeMinutes) ?? 0,
    },
    notes: String(data.notes || "").trim(),
    ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
    ...(data.createdBy !== undefined ? { createdBy: data.createdBy || null } : {}),
    ...(data.updatedBy !== undefined ? { updatedBy: data.updatedBy || null } : {}),
  };
};

const validatePayload = (payload = {}) => {
  const hasPrice = ["hourly", "halfDay", "fullDay", "daily"].some(
    (key) => payload.pricing?.[key] !== null && payload.pricing?.[key] !== undefined,
  );

  if (!payload.space) {
    const err = new Error("space is required");
    err.status = 400;
    throw err;
  }

  if (!payload.capacity?.max || Number(payload.capacity.max) < 1) {
    const err = new Error("capacity.max must be at least 1");
    err.status = 400;
    throw err;
  }

  if (!hasPrice) {
    const err = new Error("At least one event space price is required");
    err.status = 400;
    throw err;
  }
};

export async function createEventSpaceForSpace(spaceId, data, userId = null) {
  await ensureSpaceExists(spaceId);

  const payload = normalizePayload({
    ...data,
    space: spaceId,
    createdBy: userId || data.createdBy || null,
    updatedBy: userId || data.updatedBy || null,
  });

  validatePayload(payload);

  const existing = await EventSpace.findOne({ space: spaceId });
  if (existing) {
    Object.assign(existing, payload, { isActive: true });
    await existing.save();
    return existing;
  }

  return EventSpace.create(payload);
}

export async function getEventSpaceBySpace(spaceId, opts = {}) {
  await ensureSpaceExists(spaceId);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;

  return EventSpace.findOne(query).populate("space", "name slug spaceType");
}

export async function getEventSpaceById(eventSpaceId) {
  const eventSpace = await EventSpace.findById(eventSpaceId).populate(
    "space",
    "name slug spaceType",
  );

  if (!eventSpace) {
    const err = new Error("Event space details not found");
    err.status = 404;
    throw err;
  }

  return eventSpace;
}

export async function updateEventSpace(eventSpaceId, updates, userId = null) {
  const existing = await ensureEventSpaceExists(eventSpaceId);
  const nextSpaceId = updates.space || existing.space;

  await ensureSpaceExists(nextSpaceId);

  const payload = normalizePayload({
    ...updates,
    space: nextSpaceId,
    updatedBy: userId || updates.updatedBy || null,
  });

  validatePayload(payload);

  Object.assign(existing, payload);
  await existing.save();

  return existing;
}

export async function deleteEventSpace(eventSpaceId) {
  const eventSpace = await ensureEventSpaceExists(eventSpaceId);

  eventSpace.isActive = false;
  await eventSpace.save();

  return eventSpace;
}
