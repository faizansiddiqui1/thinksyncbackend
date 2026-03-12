import Space from "../models/admin_models/Space.js";

export async function getTenantIdFromSpace(spaceId) {
  if (!spaceId) return null;

  const space = await Space.findById(spaceId).select("tenantId");

  return space?.tenantId || null;
}