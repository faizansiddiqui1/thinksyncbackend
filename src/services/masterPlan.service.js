import MasterPlanTemplate from "../models/admin_models/MasterPlanTemplate.js";

const PLAN_TYPES = ["daily", "weekly", "monthly"];

function normalizeList(value = []) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizePayload(payload = {}) {
  const type = String(payload.type || "monthly").toLowerCase();
  if (!PLAN_TYPES.includes(type)) {
    const error = new Error("Only daily, weekly, and monthly master plans are supported");
    error.status = 400;
    throw error;
  }

  return {
    title: String(payload.title || "").trim(),
    type,
    description: String(payload.description || "").trim(),
    suggestedPrice: Math.max(0, Number(payload.suggestedPrice || payload.price || 0)),
    gstPercentage: Math.max(0, Number(payload.gstPercentage ?? 18)),
    currency: String(payload.currency || "INR").trim() || "INR",
    inclusions: normalizeList(payload.inclusions),
    resourceTypes: normalizeList(payload.resourceTypes),
    order: Number(payload.order || 0),
    isActive: payload.isActive !== false,
  };
}

export async function listMasterPlans(filters = {}) {
  const query = {};
  if (filters.status === "active") query.isActive = true;
  if (filters.status === "inactive") query.isActive = false;
  if (filters.type && filters.type !== "all") query.type = filters.type;

  const search = String(filters.search || "").trim();
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { inclusions: { $regex: search, $options: "i" } },
      { resourceTypes: { $regex: search, $options: "i" } },
    ];
  }

  return MasterPlanTemplate.find(query).sort({ order: 1, createdAt: -1 }).lean();
}

export async function createMasterPlan(payload = {}, user = null) {
  const normalized = normalizePayload(payload);
  if (!normalized.title) {
    const error = new Error("Master plan title is required");
    error.status = 400;
    throw error;
  }

  return MasterPlanTemplate.create({
    ...normalized,
    createdBy: user?._id || null,
    updatedBy: user?._id || null,
  });
}

export async function updateMasterPlan(id, payload = {}, user = null) {
  const normalized = normalizePayload(payload);
  if (!normalized.title) {
    const error = new Error("Master plan title is required");
    error.status = 400;
    throw error;
  }

  return MasterPlanTemplate.findByIdAndUpdate(
    id,
    {
      ...normalized,
      updatedBy: user?._id || null,
    },
    { new: true },
  ).lean();
}

export async function deleteMasterPlan(id) {
  const deleted = await MasterPlanTemplate.findByIdAndDelete(id);
  return Boolean(deleted);
}
