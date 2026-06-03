import mongoose from "mongoose";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Space from "../models/admin_models/Space.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import {
  ensureSpaceAccess,
  assertPlainAdminShortTermLeasingSpace,
  getOwnedSpaceIds,
  getActorUserId,
  isSuperAdminUser,
} from "./spaceAccess.service.js";

const ALLOWED_PLAN_TYPES = new Set(["daily", "weekly", "monthly"]);

function normalizeInclusions(value = []) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizePlanType(type) {
  return String(type || "").toLowerCase().trim();
}

function assertSupportedPlanType(type) {
  if (!ALLOWED_PLAN_TYPES.has(normalizePlanType(type))) {
    throw new Error("Only daily, weekly, and monthly plans are supported");
  }
}

async function normalizeAssignedResources(spaceId, assignedResources = []) {
  if (!Array.isArray(assignedResources) || assignedResources.length === 0) {
    return [];
  }

  const seen = new Set();
  const rawItems = assignedResources
    .map((item) => ({
      id: item?.resource || item?.resourceId || item?._id || item?.id,
      credits: Math.max(1, Number(item?.credits || 1) || 1),
    }))
    .filter((item) => item.id);

  const resourceIds = rawItems.map((item) => item.id);
  const resources = await Resource.find({
    _id: { $in: resourceIds },
    space: spaceId,
    isActive: true,
  }).lean();

  const resourceMap = new Map(resources.map((resource) => [String(resource._id), resource]));

  return rawItems
    .map((item) => {
      const id = String(item.id);
      if (seen.has(id)) return null;
      seen.add(id);

      const resource = resourceMap.get(id);
      if (!resource) {
        throw new Error("Assigned resources must belong to this space and be active");
      }

      return {
        resource: resource._id,
        credits: item.credits,
        labelSnapshot: resource.name || "",
        typeSnapshot: resource.type || "",
      };
    })
    .filter(Boolean);
}

export const createPlan = async (spaceId, data, user = null) => {
  const space = await ensureSpaceAccess(spaceId, user);
  assertPlainAdminShortTermLeasingSpace(space, user, "Pricing plans");

  if (!data.type) throw new Error("Plan type is required");
  const type = normalizePlanType(data.type);
  assertSupportedPlanType(type);

  const count = await PricingPlan.countDocuments({
    space: spaceId,
    isActive: true,
  });
  if (count >= 3) throw new Error("Maximum 3 pricing plans allowed per space");

  const existingSameType = await PricingPlan.findOne({
    space: spaceId,
    type,
    isActive: true,
  }).lean();
  if (existingSameType) {
    throw new Error(`A ${type} plan already exists for this space`);
  }

  let order = data.order;
  if (order === undefined || order === null) {
    const maxDoc = await PricingPlan.find({ space: spaceId, isActive: true })
      .sort({ order: -1 })
      .limit(1)
      .lean();
    order = maxDoc.length ? (maxDoc[0].order || 0) + 1 : 1;
  }

  if (data.popular) {
    await PricingPlan.updateMany(
      { space: spaceId, isActive: true },
      { $set: { popular: false } },
    );
  }

  const assignedResources = await normalizeAssignedResources(
    spaceId,
    data.assignedResources,
  );

  const plan = await PricingPlan.create({
    space: spaceId,
    type,
    title: data.title,
    price: Number(data.price || 0),
    gstPercentage: data.gstPercentage ?? 18,
    currency: data.currency ?? "INR",
    inclusions: normalizeInclusions(data.inclusions),
    assignedResources,
    popular: !!data.popular,
    order,
    isActive: data.isActive !== false,
    createdBy: getActorUserId(user),
    updatedBy: getActorUserId(user),
  });

  return PricingPlan.findById(plan._id)
    .populate("assignedResources.resource", "name type capacity images isActive")
    .lean();
};

export const listAllPlans = async (user = null) => {
  const query = {};

  if (!isSuperAdminUser(user)) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds?.length) return [];
    query.space = { $in: spaceIds };
  }

  return PricingPlan.find(query)
    .populate("space", "name slug owner status isPublished")
    .populate("assignedResources.resource", "name type capacity images isActive")
    .sort({ createdAt: -1 })
    .lean()
    .exec();
};

export const listPlans = async (spaceId, user = null) => {
  await ensureSpaceAccess(spaceId, user);
  return PricingPlan.find({ space: spaceId })
    .populate("assignedResources.resource", "name type capacity images isActive")
    .sort({ order: 1 })
    .lean()
    .exec();
};

export const updatePlan = async (spaceId, planId, data, user = null) => {
  await ensureSpaceAccess(spaceId, user);

  if (!mongoose.Types.ObjectId.isValid(planId)) {
    throw new Error("Invalid plan id");
  }

  const plan = await PricingPlan.findOne({ _id: planId, space: spaceId });
  if (!plan) return null;

  if (data.type) {
    const type = normalizePlanType(data.type);
    assertSupportedPlanType(type);

    if (type !== plan.type) {
      const other = await PricingPlan.findOne({
        space: spaceId,
        type,
        isActive: true,
        _id: { $ne: planId },
      }).lean();
      if (other) {
        throw new Error(`Another active ${type} plan already exists for this space`);
      }
      plan.type = type;
    }
  }

  if (data.popular) {
    await PricingPlan.updateMany(
      { space: spaceId, isActive: true },
      { $set: { popular: false } },
    );
  }

  const allowed = [
    "title",
    "price",
    "gstPercentage",
    "currency",
    "popular",
    "order",
    "isActive",
    "inclusions",
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (key === "inclusions") {
        plan[key] = normalizeInclusions(data[key]);
      } else {
        plan[key] = key === "price" || key === "order" || key === "gstPercentage"
          ? Number(data[key])
          : data[key];
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, "assignedResources")) {
    plan.assignedResources = await normalizeAssignedResources(
      spaceId,
      data.assignedResources,
    );
  }

  plan.updatedBy = getActorUserId(user);
  await plan.save();

  const activePlans = await PricingPlan.find({
    space: spaceId,
    isActive: true,
  }).sort({ order: 1, createdAt: 1 });
  for (let i = 0; i < activePlans.length; i += 1) {
    activePlans[i].order = i + 1;
    await activePlans[i].save();
  }

  return PricingPlan.findById(plan._id)
    .populate("assignedResources.resource", "name type capacity images isActive")
    .lean();
};

export const deletePlan = async (spaceId, planId, user = null) => {
  await ensureSpaceAccess(spaceId, user);

  if (!mongoose.Types.ObjectId.isValid(planId)) {
    throw new Error("Invalid plan id");
  }

  const plan = await PricingPlan.findOne({ _id: planId, space: spaceId });
  if (!plan) return null;

  plan.isActive = false;
  plan.updatedBy = getActorUserId(user);
  await plan.save();

  const plans = await PricingPlan.find({ space: spaceId, isActive: true }).sort(
    { order: 1, createdAt: 1 },
  );
  for (let i = 0; i < plans.length; i += 1) {
    plans[i].order = i + 1;
    await plans[i].save();
  }

  return true;
};
