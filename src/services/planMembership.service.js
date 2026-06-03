import mongoose from "mongoose";
import Booking from "../models/user_models/Booking.js";
import PlanPurchase from "../models/user_models/PlanPurchase.js";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import Space from "../models/admin_models/Space.js";
import { getOwnedSpaceIds, isSuperAdminUser } from "./spaceAccess.service.js";

const RESERVATION_ACTIVE_STATUSES = ["confirmed", "pending", "pending_hold", "completed"];

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date, months) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function normalizeStatus(purchase) {
  if (!purchase) return "expired";
  if (purchase.status === "cancelled") return "cancelled";

  const now = new Date();
  const start = new Date(purchase.validity.startDate);
  const end = new Date(purchase.validity.endDate);

  if (now < start) return "upcoming";
  if (now > end) return "expired";
  return "active";
}

function calculateValidity(planType, startDate) {
  const start = startOfDay(startDate);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Valid start date is required");
  }

  if (planType === "daily") {
    return { startDate: start, endDate: endOfDay(start) };
  }

  if (planType === "weekly") {
    return { startDate: start, endDate: endOfDay(addDays(start, 6)) };
  }

  if (planType === "monthly") {
    return { startDate: start, endDate: endOfDay(addDays(addMonths(start, 1), -1)) };
  }

  throw new Error("Only daily, weekly, and monthly plans are supported");
}

function makeUserSnapshot(user) {
  return {
    userId: user._id,
    name: user.username || user.name || "",
    email: user.email || "",
    phone: user.phoneNumber || user.phone || "",
  };
}

async function refreshPurchaseUsage(purchaseId) {
  const purchase = await PlanPurchase.findById(purchaseId);
  if (!purchase) return null;

  const usage = await Booking.aggregate([
    {
      $match: {
        planPurchase: purchase._id,
        reservationType: "PLAN_RESERVATION",
        status: { $in: RESERVATION_ACTIVE_STATUSES },
      },
    },
    { $unwind: "$resources" },
    {
      $group: {
        _id: "$resources.resourceId",
        used: { $sum: { $ifNull: ["$resources.quantity", 1] } },
      },
    },
  ]);

  const usageMap = new Map(usage.map((item) => [String(item._id), Number(item.used || 0)]));
  purchase.credits = (purchase.credits || []).map((credit) => ({
    ...(credit.toObject?.() || credit),
    used: usageMap.get(String(credit.resource)) || 0,
  }));
  purchase.status = normalizeStatus(purchase);
  await purchase.save();
  return purchase;
}

function serializePurchase(purchase, reservations = []) {
  const source = purchase?.toObject ? purchase.toObject() : purchase;
  const status = normalizeStatus(source);
  const credits = (source.credits || []).map((credit) => ({
    ...credit,
    remaining: Math.max(0, Number(credit.total || 0) - Number(credit.used || 0)),
  }));

  return {
    ...source,
    status,
    credits,
    reservations,
  };
}

export async function purchasePlan(user, payload = {}) {
  if (!user?._id) return { success: false, error: "Unauthorized" };

  const planId = payload.planId;
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    return { success: false, error: "Valid plan id is required" };
  }

  const plan = await PricingPlan.findOne({ _id: planId, isActive: true })
    .populate("assignedResources.resource", "name type isActive space")
    .lean();
  if (!plan) return { success: false, error: "Plan not found" };
  if (!["daily", "weekly", "monthly"].includes(plan.type)) {
    return { success: false, error: "Only daily, weekly, and monthly plans can be purchased" };
  }

  const space = await Space.findById(plan.space).select("_id name slug isPublished spaceType").lean();
  if (!space || !space.isPublished) return { success: false, error: "Space not available" };

  const assignedResources = Array.isArray(plan.assignedResources)
    ? plan.assignedResources
    : [];
  if (!assignedResources.length) {
    return { success: false, error: "This plan has no assigned resources" };
  }

  const { startDate, endDate } = calculateValidity(plan.type, payload.startDate);
  const basePrice = Number(plan.price || 0);
  const gstPercentage = Number(plan.gstPercentage ?? 18);
  const gstAmount = Math.round((basePrice * gstPercentage) / 100);
  const totalAmount = basePrice + gstAmount;

  const purchase = await PlanPurchase.create({
    user: makeUserSnapshot(user),
    space: plan.space,
    plan: {
      planId: plan._id,
      title: plan.title,
      type: plan.type,
      price: basePrice,
      gstPercentage,
      currency: plan.currency || "INR",
    },
    validity: { startDate, endDate },
    credits: assignedResources.map((item) => ({
      resource: item.resource?._id || item.resource,
      resourceName: item.resource?.name || item.labelSnapshot || "",
      resourceType: item.resource?.type || item.typeSnapshot || "",
      total: Math.max(1, Number(item.credits || 1) || 1),
      used: 0,
    })),
    status: normalizeStatus({ validity: { startDate, endDate } }),
    payment: {
      status: "paid",
      method: payload.paymentMethod || "internal",
      reference: payload.paymentReference || `plan_${new mongoose.Types.ObjectId()}`,
      paidAt: new Date(),
    },
    priceBreakdown: {
      basePrice,
      gstPercentage,
      gstAmount,
      totalAmount,
    },
  });

  return { success: true, data: serializePurchase(purchase) };
}

export async function activatePaidPlanPurchase(user, payload = {}) {
  if (payload.paymentReference) {
    const existing = await PlanPurchase.findOne({
      "payment.reference": payload.paymentReference,
    });
    if (existing) {
      return { success: true, data: serializePurchase(existing) };
    }
  }

  return purchasePlan(user, payload);
}

export async function getMyPlans(userId) {
  const purchases = await PlanPurchase.find({ "user.userId": userId })
    .populate("space", "name slug address spaceType")
    .populate("credits.resource", "name type capacity images")
    .sort({ "validity.startDate": -1, createdAt: -1 });

  const purchaseIds = purchases.map((purchase) => purchase._id);
  const reservations = await Booking.find({
    planPurchase: { $in: purchaseIds },
    reservationType: "PLAN_RESERVATION",
  })
    .populate("resources.resourceId", "name type images")
    .sort({ startDateTime: -1 })
    .lean();

  const reservationMap = new Map();
  reservations.forEach((reservation) => {
    const key = String(reservation.planPurchase);
    const list = reservationMap.get(key) || [];
    list.push(reservation);
    reservationMap.set(key, list);
  });

  const refreshed = [];
  for (const purchase of purchases) {
    const updated = await refreshPurchaseUsage(purchase._id);
    refreshed.push(serializePurchase(updated || purchase, reservationMap.get(String(purchase._id)) || []));
  }

  return {
    success: true,
    data: {
      plans: refreshed,
      reservations,
    },
  };
}

export async function createPlanReservation(user, payload = {}) {
  if (!user?._id) return { success: false, error: "Unauthorized" };

  const purchaseId = payload.planPurchaseId;
  const resourceId = payload.resourceId;
  if (!mongoose.Types.ObjectId.isValid(purchaseId) || !mongoose.Types.ObjectId.isValid(resourceId)) {
    return { success: false, error: "Plan purchase and resource are required" };
  }

  const purchase = await refreshPurchaseUsage(purchaseId);
  if (!purchase || String(purchase.user?.userId) !== String(user._id)) {
    return { success: false, error: "Plan purchase not found" };
  }

  const purchaseStatus = normalizeStatus(purchase);
  if (!["active", "upcoming"].includes(purchaseStatus)) {
    return { success: false, error: "Plan reservations are allowed only for active or upcoming plans" };
  }

  const credit = (purchase.credits || []).find(
    (item) => String(item.resource) === String(resourceId),
  );
  if (!credit) {
    return { success: false, error: "Resource is not included in this plan" };
  }

  const remaining = Math.max(0, Number(credit.total || 0) - Number(credit.used || 0));
  if (remaining <= 0) {
    return { success: false, error: "No remaining reservation credits for this resource" };
  }

  const startDateTime = payload.startDateTime ? new Date(payload.startDateTime) : null;
  const endDateTime = payload.endDateTime ? new Date(payload.endDateTime) : null;
  if (
    !startDateTime ||
    !endDateTime ||
    Number.isNaN(startDateTime.getTime()) ||
    Number.isNaN(endDateTime.getTime()) ||
    endDateTime <= startDateTime
  ) {
    return { success: false, error: "Valid start and end time are required" };
  }

  if (
    startDateTime < new Date(purchase.validity.startDate) ||
    endDateTime > new Date(purchase.validity.endDate)
  ) {
    return { success: false, error: "Reservation must be inside plan validity" };
  }

  const resource = await Resource.findOne({
    _id: resourceId,
    space: purchase.space,
    isActive: true,
  }).lean();
  if (!resource) return { success: false, error: "Resource not available" };

  const availability = await Booking.checkAvailability(resourceId, startDateTime, endDateTime);
  if (!availability.available) {
    return { success: false, error: `${resource.name || "Resource"} is already booked` };
  }

  const booking = await Booking.create({
    user: makeUserSnapshot(user),
    space: purchase.space,
    spaceType: payload.spaceType || "resource",
    resources: [
      {
        resourceId: resource._id,
        name: resource.name,
        type: resource.type,
        quantity: 1,
        unitPrice: 0,
      },
    ],
    addons: [],
    plan: {
      planId: purchase.plan.planId,
      type: purchase.plan.type,
    },
    bookingType: payload.bookingType || "daily",
    reservationType: "PLAN_RESERVATION",
    planPurchase: purchase._id,
    bookingDuration: {
      startDate: startDateTime,
      endDate: endDateTime,
      startTime: payload.startTime || "",
      endTime: payload.endTime || "",
    },
    startDateTime,
    endDateTime,
    timezone: payload.timezone || "Asia/Kolkata",
    priceBreakdown: {
      basePrice: 0,
      gstPercentage: 0,
      gstAmount: 0,
      deposit: 0,
      discount: 0,
      totalAmount: 0,
    },
    status: "confirmed",
    payment: {
      method: "internal",
      status: "paid",
      gateway: "plan_entitlement",
      reference: `plan_res_${new mongoose.Types.ObjectId()}`,
      paidAt: new Date(),
    },
    paymentStatus: "paid",
    specialRequests: payload.specialRequests || "",
    notes: "Reserved through plan entitlement",
    holdExpiresAt: null,
  });

  await refreshPurchaseUsage(purchase._id);

  return { success: true, data: { booking } };
}

export async function getPlanAnalytics(user = null) {
  const query = {};
  if (!isSuperAdminUser(user)) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds.length) {
      return {
        success: true,
        data: {
          planPurchases: 0,
          activeSubscribers: 0,
          planRevenue: 0,
          reservationUtilization: 0,
          mostReservedResources: [],
        },
      };
    }
    query.space = { $in: spaceIds };
  }

  const purchases = await PlanPurchase.find(query).populate("space", "name slug owner").lean();
  const purchaseIds = purchases.map((purchase) => purchase._id);
  const reservations = await Booking.find({
    planPurchase: { $in: purchaseIds },
    reservationType: "PLAN_RESERVATION",
  }).lean();

  const activeSubscribers = purchases.filter((purchase) => normalizeStatus(purchase) === "active").length;
  const resourceUsage = new Map();
  reservations.forEach((booking) => {
    (booking.resources || []).forEach((item) => {
      const key = String(item.resourceId);
      const current = resourceUsage.get(key) || {
        resourceId: key,
        resourceName: item.name || "Resource",
        reservations: 0,
      };
      current.reservations += 1;
      resourceUsage.set(key, current);
    });
  });

  return {
    success: true,
    data: {
      planPurchases: purchases.length,
      activeSubscribers,
      planRevenue: purchases.reduce(
        (sum, purchase) => sum + Number(purchase.priceBreakdown?.totalAmount || 0),
        0,
      ),
      reservationUtilization: reservations.length,
      mostReservedResources: Array.from(resourceUsage.values()).sort(
        (a, b) => b.reservations - a.reservations,
      ),
    },
  };
}

export async function listAdminPlanPurchases(user = null, filters = {}) {
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(Math.max(1, Number(filters.limit || 50)), 100);
  const query = {};

  if (!isSuperAdminUser(user)) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds.length) {
      return {
        success: true,
        data: {
          purchases: [],
          pagination: { page, limit, total: 0, pages: 0 },
          filters: {},
        },
      };
    }
    query.space = { $in: spaceIds };
  }

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }

  if (filters.planId && mongoose.Types.ObjectId.isValid(filters.planId)) {
    query["plan.planId"] = filters.planId;
  }

  if (filters.spaceId && mongoose.Types.ObjectId.isValid(filters.spaceId)) {
    query.space = filters.spaceId;
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  const search = String(filters.search || "").trim();
  if (search) {
    query.$or = [
      { "user.name": { $regex: search, $options: "i" } },
      { "user.email": { $regex: search, $options: "i" } },
      { "user.phone": { $regex: search, $options: "i" } },
      { "plan.title": { $regex: search, $options: "i" } },
      { "plan.type": { $regex: search, $options: "i" } },
    ];
  }

  const total = await PlanPurchase.countDocuments(query);
  const purchases = await PlanPurchase.find(query)
    .populate("space", "name slug address spaceType owner")
    .populate("credits.resource", "name type capacity images")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    success: true,
    data: {
      purchases: purchases.map((purchase) => serializePurchase(purchase)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        status: filters.status || "all",
        planId: filters.planId || "all",
        spaceId: filters.spaceId || "all",
      },
    },
  };
}
