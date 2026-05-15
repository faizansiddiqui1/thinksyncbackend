import Space from "../models/admin_models/Space.js";
import VirtualOfficePlan from "../models/admin_models/VirtualOfficePlan.js";

const VALID_CATEGORIES = [
  "company_registration",
  "gst_registration",
  "business_address",
];

const VALID_DURATIONS = [12, 24, 36];

const ensureSpaceExists = async (spaceId) => {
  const space = await Space.findById(spaceId).select("_id");
  if (!space) {
    const err = new Error("Space not found");
    err.status = 404;
    throw err;
  }
  return space;
};

const ensurePlanExists = async (planId) => {
  const plan = await VirtualOfficePlan.findById(planId);
  if (!plan) {
    const err = new Error("Virtual office plan not found");
    err.status = 404;
    throw err;
  }
  return plan;
};

const validatePayload = (data, { isUpdate = false } = {}) => {
  if (!isUpdate) {
    if (!data.space) {
      const err = new Error("space is required");
      err.status = 400;
      throw err;
    }

    if (!data.category) {
      const err = new Error("category is required");
      err.status = 400;
      throw err;
    }

    if (!data.durationMonths) {
      const err = new Error("durationMonths is required");
      err.status = 400;
      throw err;
    }

    if (!data.price?.monthly && data.price?.monthly !== 0) {
      const err = new Error("price.monthly is required");
      err.status = 400;
      throw err;
    }
  }

  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    const err = new Error("Invalid category");
    err.status = 400;
    throw err;
  }

  if (
    data.durationMonths &&
    !VALID_DURATIONS.includes(Number(data.durationMonths))
  ) {
    const err = new Error("Invalid durationMonths. Use 12, 24, or 36");
    err.status = 400;
    throw err;
  }

  if (data.price?.monthly != null && Number(data.price.monthly) < 0) {
    const err = new Error("price.monthly cannot be negative");
    err.status = 400;
    throw err;
  }

  if (data.price?.total != null && Number(data.price.total) < 0) {
    const err = new Error("price.total cannot be negative");
    err.status = 400;
    throw err;
  }
};

const normalizeCreatePayload = (data) => {
  const durationMonths = Number(data.durationMonths);
  const monthly = Number(data.price?.monthly ?? 0);
  const total =
    data.price?.total != null
      ? Number(data.price.total)
      : monthly * durationMonths;

  return {
    space: data.space,
    category: data.category,
    title:
      data.title ||
      `${data.category?.replace(/_/g, " ")} | ${durationMonths} Months`,
    durationMonths,
    price: {
      monthly,
      total,
      currency: data.price?.currency || "INR",
    },
    whatYouGet: Array.isArray(data.whatYouGet) ? data.whatYouGet : [],
    inclusions: Array.isArray(data.inclusions) ? data.inclusions : [],
    features: Array.isArray(data.features) ? data.features : [],
    popular: Boolean(data.popular),
    order: Number(data.order || 0),
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    createdBy: data.createdBy || null,
    updatedBy: data.updatedBy || null,
  };
};

const normalizeUpdatePayload = (data, existingPlan) => {
  const durationMonths = data.durationMonths
    ? Number(data.durationMonths)
    : existingPlan.durationMonths;

  const monthly =
    data.price?.monthly != null
      ? Number(data.price.monthly)
      : existingPlan.price?.monthly;

  const total =
    data.price?.total != null
      ? Number(data.price.total)
      : monthly != null && durationMonths
        ? Number(monthly) * Number(durationMonths)
        : existingPlan.price?.total;

  return {
    ...(data.space ? { space: data.space } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(data.title ? { title: data.title } : {}),
    ...(data.durationMonths ? { durationMonths } : {}),
    ...(data.whatYouGet ? { whatYouGet: data.whatYouGet } : {}),
    ...(data.inclusions ? { inclusions: data.inclusions } : {}),
    ...(data.features ? { features: data.features } : {}),
    ...(data.popular !== undefined ? { popular: Boolean(data.popular) } : {}),
    ...(data.order !== undefined ? { order: Number(data.order) } : {}),
    ...(data.isActive !== undefined
      ? { isActive: Boolean(data.isActive) }
      : {}),
    ...(data.updatedBy ? { updatedBy: data.updatedBy } : {}),
    price: {
      monthly: monthly ?? existingPlan.price?.monthly ?? 0,
      total: total ?? existingPlan.price?.total ?? 0,
      currency: data.price?.currency || existingPlan.price?.currency || "INR",
    },
  };
};

export async function createVirtualOfficePlanForSpace(
  spaceId,
  data,
  userId = null,
) {
  await ensureSpaceExists(spaceId);

  const payload = normalizeCreatePayload({
    ...data,
    space: spaceId,
    createdBy: userId || data.createdBy || null,
    updatedBy: userId || data.updatedBy || null,
  });

  validatePayload(payload);

  const existing = await VirtualOfficePlan.findOne({
    space: spaceId,
    category: payload.category,
    durationMonths: payload.durationMonths,
    isActive: true,
  }).lean();

  if (existing) {
    const err = new Error("Plan already exists for this category and duration");
    err.status = 400;
    throw err;
  }

  const plan = await VirtualOfficePlan.create(payload);
  return plan;
}

export async function getVirtualOfficePlansBySpace(spaceId, opts = {}) {
  await ensureSpaceExists(spaceId);

  const query = { space: spaceId };
  if (opts.activeOnly) query.isActive = true;
  if (opts.category) query.category = opts.category;

  const q = VirtualOfficePlan.find(query).populate("space", "name slug");

  if (opts.sort) q.sort(opts.sort);
  if (opts.limit) q.limit(opts.limit);
  if (opts.skip) q.skip(opts.skip);

  return q.exec();
}

export async function getVirtualOfficePlanById(planId) {
  const plan = await VirtualOfficePlan.findById(planId).populate(
    "space",
    "name slug",
  );

  if (!plan) {
    const err = new Error("Virtual office plan not found");
    err.status = 404;
    throw err;
  }

  return plan;
}

export async function updateVirtualOfficePlan(planId, updates, userId = null) {
  const existingPlan = await ensurePlanExists(planId);
  validatePayload(updates, { isUpdate: true });

  const nextSpaceId = updates.space || existingPlan.space;
  await ensureSpaceExists(nextSpaceId);

  const nextCategory = updates.category || existingPlan.category;
  const nextDuration = updates.durationMonths
    ? Number(updates.durationMonths)
    : existingPlan.durationMonths;

  const duplicate = await VirtualOfficePlan.findOne({
    _id: { $ne: planId },
    space: nextSpaceId,
    category: nextCategory,
    durationMonths: nextDuration,
    isActive: true,
  }).lean();

  if (duplicate) {
    const err = new Error(
      "Another plan already exists for this category and duration",
    );
    err.status = 400;
    throw err;
  }

  const payload = normalizeUpdatePayload(
    {
      ...updates,
      updatedBy: userId || updates.updatedBy || null,
    },
    existingPlan,
  );

  Object.assign(existingPlan, payload);
  await existingPlan.save();

  return existingPlan;
}

export async function deleteVirtualOfficePlan(planId) {
  const plan = await ensurePlanExists(planId);

  plan.isActive = false;
  await plan.save();

  return plan;
}
