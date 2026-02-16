import mongoose from "mongoose";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Space from "../models/admin_models/Space.js";

const ensureSpace = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId)) throw new Error("Invalid space id");
  const s = await Space.findById(spaceId).select("_id").lean();
  if (!s) throw new Error("Space not found");
  return s;
};

export const createPlan = async (spaceId, data, userId = null) => {
  await ensureSpace(spaceId);

  // enforce max 3 active plans
  const count = await PricingPlan.countDocuments({ space: spaceId, isActive: true });
  if (count >= 3) throw new Error("Maximum 3 pricing plans allowed per space");

  // prevent duplicate active plan type for same space
  if (!data.type) throw new Error("Plan type is required");
  const existingSameType = await PricingPlan.findOne({
    space: spaceId,
    type: data.type,
    isActive: true,
  }).lean();
  if (existingSameType) throw new Error(`A ${data.type} plan already exists for this space`);

  // auto-generate order if not provided
  let order = data.order;
  if (order === undefined || order === null) {
    const maxDoc = await PricingPlan.find({ space: spaceId, isActive: true })
      .sort({ order: -1 })
      .limit(1)
      .lean();
    order = maxDoc.length ? (maxDoc[0].order || 0) + 1 : 1;
  }

  // if marked popular, unset others (only among active plans)
  if (data.popular) {
    await PricingPlan.updateMany({ space: spaceId, isActive: true }, { $set: { popular: false } });
  }

  const plan = await PricingPlan.create({
    space: spaceId,
    type: data.type,
    title: data.title,
    price: data.price,
    gstPercentage: data.gstPercentage ?? 18,
    currency: data.currency ?? "INR",
    inclusions: data.inclusions || [],
    popular: !!data.popular,
    order,
    isActive: true,
    createdBy: userId,
    updatedBy: userId,
  });

  return plan.toObject ? plan.toObject() : plan;
};

export const listPlans = async (spaceId) => {
  await ensureSpace(spaceId);
  const plans = await PricingPlan.find({ space: spaceId, isActive: true })
    .sort({ order: 1 })
    .lean()
    .exec();
  return plans;
};

export const updatePlan = async (spaceId, planId, data, userId = null) => {
  await ensureSpace(spaceId);

  if (!mongoose.Types.ObjectId.isValid(planId)) throw new Error("Invalid plan id");

  // only update active plans
  const plan = await PricingPlan.findOne({ _id: planId, space: spaceId, isActive: true });
  if (!plan) return null;

  // if changing type, ensure no other active plan has same type
  if (data.type && data.type !== plan.type) {
    const other = await PricingPlan.findOne({
      space: spaceId,
      type: data.type,
      isActive: true,
      _id: { $ne: planId },
    }).lean();
    if (other) throw new Error(`Another active ${data.type} plan already exists for this space`);
  }

  // if trying to set popular -> unset others
  if (data.popular) {
    await PricingPlan.updateMany({ space: spaceId, isActive: true }, { $set: { popular: false } });
  }

  // assign allowed fields only
  const allowed = ["type", "title", "price", "gstPercentage", "currency", "inclusions", "popular", "order", "isActive"];
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, k)) plan[k] = data[k];
  }

  plan.updatedBy = userId;
  await plan.save();

  // normalize orders (re-sequence active plans to 1..N)
  const activePlans = await PricingPlan.find({ space: spaceId, isActive: true }).sort({ order: 1, createdAt: 1 });
  for (let i = 0; i < activePlans.length; i++) {
    activePlans[i].order = i + 1;
    await activePlans[i].save();
  }

  return plan.toObject ? plan.toObject() : plan;
};

export const deletePlan = async (spaceId, planId, userId = null) => {
  await ensureSpace(spaceId);

  if (!mongoose.Types.ObjectId.isValid(planId)) throw new Error("Invalid plan id");

  // only soft-delete active plans
  const plan = await PricingPlan.findOne({ _id: planId, space: spaceId, isActive: true });
  if (!plan) return null;

  plan.isActive = false;
  plan.updatedBy = userId;
  await plan.save();

  // resequence remaining active plans
  const plans = await PricingPlan.find({ space: spaceId, isActive: true }).sort({ order: 1, createdAt: 1 });
  for (let i = 0; i < plans.length; i++) {
    plans[i].order = i + 1;
    await plans[i].save();
  }

  return true;
};
