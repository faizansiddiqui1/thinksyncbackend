import mongoose from "mongoose";
import Space from "../models/admin_models/Space.js";
import Role from "../models/super_admin_models/Role.js";
import Company from "../models/super_admin_models/Company.model.js";

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function getActorUserId(user = null) {
  return user?._id || user?.id || null;
}

export function isSuperAdminUser(user = null) {
  return String(user?.role || "").toLowerCase() === "super_admin";
}

export async function getScopeOwnerId(user = null) {
  if (!user) return null;

  if (isSuperAdminUser(user) || String(user?.role || "").toLowerCase() === "admin") {
    return getActorUserId(user);
  }

  const customRoleIds = Array.isArray(user?.customRoles) ? user.customRoles : [];
  if (!customRoleIds.length) {
    return getActorUserId(user);
  }

  const scopedRole = await Role.findOne({
    _id: { $in: customRoleIds },
    createdBy: { $exists: true, $ne: null },
  })
    .select("createdBy")
    .lean();

  return scopedRole?.createdBy || getActorUserId(user);
}

export async function getCompanySpaceIds(user) {
  if (!user?.companyId) return [];

  const company = await Company.findById(user.companyId)
    .select("spaces assignedSpaceId employees.user employees.spaces owner")
    .lean();

  if (!company) return [];

  const ids = new Set();

  if (company.assignedSpaceId) {
    ids.add(String(company.assignedSpaceId));
  }

  if (Array.isArray(company.spaces)) {
    company.spaces.forEach((spaceId) => {
      if (spaceId) ids.add(String(spaceId));
    });
  }

  const employee = Array.isArray(company.employees)
    ? company.employees.find((item) => String(item.user) === String(user._id))
    : null;

  if (employee?.spaces?.length) {
    employee.spaces.forEach((spaceId) => {
      if (spaceId) ids.add(String(spaceId));
    });
  }

  return Array.from(ids).map((id) => new mongoose.Types.ObjectId(id));
}

export async function hasCompanySpaceAccess(user, spaceId) {
  if (!user?.companyId) return false;
  const companySpaceIds = await getCompanySpaceIds(user);
  return companySpaceIds.some((id) => String(id) === String(spaceId));
}

export async function ensureSpaceAccess(
  spaceId,
  user,
  { select = "_id owner name slug status isPublished approvalStatus address spaceType" } = {},
) {
  if (!spaceId || !mongoose.Types.ObjectId.isValid(String(spaceId))) {
    throw makeHttpError(400, "Invalid space id");
  }

  const space = await Space.findById(spaceId).select(select);
  if (!space) {
    throw makeHttpError(404, "Space not found");
  }

  if (!isSuperAdminUser(user)) {
    const hasCompanyAccess = await hasCompanySpaceAccess(user, spaceId);
    if (!hasCompanyAccess) {
      const actorId = await getScopeOwnerId(user);
      if (!actorId) {
        throw makeHttpError(401, "Unauthorized");
      }

      if (String(space.owner) !== String(actorId)) {
        throw makeHttpError(403, "You do not have access to this space");
      }
    }
  }

  return space;
}

export async function getOwnedSpaceIds(user) {
  if (isSuperAdminUser(user)) {
    return null;
  }

  if (user?.companyId) {
    const companySpaceIds = await getCompanySpaceIds(user);
    return companySpaceIds;
  }

  const actorId = await getScopeOwnerId(user);
  if (!actorId) {
    throw makeHttpError(401, "Unauthorized");
  }

  const spaces = await Space.find({ owner: actorId }).select("_id").lean();
  return spaces.map((space) => space._id);
}
