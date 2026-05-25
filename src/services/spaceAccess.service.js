import mongoose from "mongoose";
import Space from "../models/admin_models/Space.js";
import Role from "../models/super_admin_models/Role.js";

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
    const actorId = await getScopeOwnerId(user);
    if (!actorId) {
      throw makeHttpError(401, "Unauthorized");
    }

    if (String(space.owner) !== String(actorId)) {
      throw makeHttpError(403, "You do not have access to this space");
    }
  }

  return space;
}

export async function getOwnedSpaceIds(user) {
  if (isSuperAdminUser(user)) {
    return null;
  }

  const actorId = await getScopeOwnerId(user);
  if (!actorId) {
    throw makeHttpError(401, "Unauthorized");
  }

  const spaces = await Space.find({ owner: actorId }).select("_id").lean();
  return spaces.map((space) => space._id);
}
