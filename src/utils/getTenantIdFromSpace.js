import Space from "../models/admin_models/Space.js";


export async function getTenantIdFromSpace(spaceId) {
  if (!spaceId) return null;

  const space = await Space.findById(spaceId).select("owner");
  
  if (!space) throw new Error("Space not found");

  return space.owner;
}