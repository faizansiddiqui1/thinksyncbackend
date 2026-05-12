// backend/services/search.service.js
import Space from "../models/admin_models/Space.js";

const escapeRegex = (text = "") =>
  text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

export const textSearch = async ({ q, lat, lng, limit = 20 }) => {
  if (!q || q.trim().length === 0) return { docs: [], total: 0 };

  const limitN = Math.min(limit || 20, 100);

  // If lat/lng provided, use aggregation with $geoNear for distance
  if (lat != null && lng != null) {
    const near = {
      type: "Point",
      coordinates: [parseFloat(lng), parseFloat(lat)],
    };

    const agg = [
      {
        $geoNear: {
          near,
          distanceField: "dist.calculated",
          spherical: true,
          key: "address.location",
          query: { $text: { $search: q } },
          limit: limitN,
        },
      },
      {
        $project: {
          ownerId: 1,
          name: 1,
          address: 1,
          score: { $meta: "textScore" },
          "dist.calculated": 1,
        },
      },
      { $sort: { score: -1, "dist.calculated": 1 } },
    ];

    const docs = await Space.aggregate(agg).exec();
    return { docs, total: docs.length };
  }

  // Else do text search without geo
  const docs = await Space.find(
    { $text: { $search: q } },
    { score: { $meta: "textScore" }, name: 1, address: 1, location: 1 },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(limitN)
    .lean()
    .exec();

  return { docs, total: docs.length };
};

/**
 * Near-me search: required lat/lng, radius in meters (default 5000), optional limit
 */
export const nearSearch = async ({ lat, lng, radius = 20000, limit = 50 }) => {
  if (lat == null || lng == null) throw new Error("lat & lng required");

  const near = {
    type: "Point",
    coordinates: [parseFloat(lng), parseFloat(lat)],
  };

  const agg = [
    {
      $geoNear: {
        near,
        distanceField: "dist.calculated",
        spherical: true,
        key: "address.location",
        maxDistance: parseInt(radius, 10),
      },
    },
    {
      $project: {
        ownerId: 1,
        name: 1,
        address: 1,
        "dist.calculated": 1,
      },
    },
    { $limit: Math.min(limit || 50, 200) },
  ];

  const docs = await Space.aggregate(agg).exec();
  return { docs, total: docs.length };
};

export const suggest = async ({ input, limit = 8 }) => {
  input = String(input || "").trim();
  if (!input) return [];

  const maxLimit = Math.min(limit || 8, 50);

  // 1) Prefix regex (anchored) - fast and can use index on name/address if present
  const prefixRe = new RegExp("^" + escapeRegex(input), "i");

  let docs = await Space.find(
    {
      $or: [{ name: prefixRe }, { "address.street": prefixRe }],
    },
    { name: 1, address: 1 },
  )
    .limit(maxLimit)
    .lean()
    .exec();

  // If enough results, return
  if (docs && docs.length >= Math.min(3, maxLimit)) {
    return docs.map((d) => ({
      _id: d._id,
      name: d.name,
      address: d.address,
      lat: d.address?.location?.coordinates?.[1] ?? null,
      lng: d.address?.location?.coordinates?.[0] ?? null,
    }));
  }

  // 2) Substring match (anywhere) - broader matching
  // Only run if prefix didn't return enough
  const subRe = new RegExp(escapeRegex(input), "i");

  // Merge prefix results + substring results excluding duplicates
  const subDocs = await Space.find(
    {
      $or: [{ name: subRe }, { "address.street": subRe }],
    },
    { name: 1, address: 1, location: 1 },
  )
    .limit(maxLimit)
    .lean()
    .exec();

  const merged = [...docs, ...subDocs].slice(0, maxLimit);

  return merged.map((d) => ({
    _id: d._id,
    name: d.name,
    address: d.address,
    lat: d.address?.location?.coordinates?.[1] ?? null,
    lng: d.address?.location?.coordinates?.[0] ?? null,
  }));
};
