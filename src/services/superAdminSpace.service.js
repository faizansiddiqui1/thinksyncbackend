import mongoose from "mongoose";
import Space from "../models/admin_models/Space.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import User from "../models/user_models/User.js";
import City from "../models/super_admin_models/City.model.js";
import MarketplaceAudit from "../models/super_admin_models/MarketplaceAudit.js";

const PAGE_SIZES = new Set([10, 25, 50, 100]);
const ALLOWED_ACTIONS = new Set([
  "approve",
  "reject",
  "suspend",
  "restore",
  "publish",
  "unpublish",
]);

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePage(value) {
  return Math.max(Number.parseInt(value, 10) || 1, 1);
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10) || 10;
  return PAGE_SIZES.has(parsed) ? parsed : 10;
}

function normalizeSort(sort = "newest") {
  const options = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name_asc: { name: 1 },
    name_desc: { name: -1 },
    approval_status: { approvalStatus: 1, createdAt: -1 },
  };

  return options[sort] || options.newest;
}

function buildSpaceState(space) {
  return {
    approvalStatus: space.approvalStatus || "pending",
    operationalStatus: space.operationalStatus || "active",
    isPublished: Boolean(space.isPublished),
    status: space.status || "DRAFT",
    adminNotes: space.adminNotes || "",
  };
}

async function findOwnerIds(search = "") {
  const regex = new RegExp(escapeRegex(search), "i");
  const [users, profiles] = await Promise.all([
    User.find({
      $or: [{ username: regex }, { email: regex }, { phoneNumber: regex }],
    })
      .select("_id")
      .lean()
      .exec(),
    AdminProfile.find({ "company.name": regex })
      .select("owner")
      .lean()
      .exec(),
  ]);

  return [
    ...new Set(
      [...users.map((item) => item._id), ...profiles.map((item) => item.owner)]
        .filter(Boolean)
        .map(String),
    ),
  ];
}

async function buildQuery(filters = {}) {
  const query = {};

  if (filters.approvalStatus && filters.approvalStatus !== "all") {
    query.approvalStatus = filters.approvalStatus;
  }

  if (filters.operationalStatus && filters.operationalStatus !== "all") {
    query.operationalStatus =
      filters.operationalStatus === "active"
        ? { $in: ["active", null] }
        : filters.operationalStatus;
  }

  if (filters.listingStatus === "published") {
    query.isPublished = true;
  } else if (filters.listingStatus === "draft") {
    query.isPublished = false;
  }

  if (filters.city && filters.city !== "all") {
    query["address.city"] = filters.city;
  }

  if (filters.state && filters.state !== "all") {
    query["address.state"] = filters.state;
  }

  if (filters.country && filters.country !== "all") {
    query["address.country"] = filters.country;
  }

  if (filters.workspaceType && filters.workspaceType !== "all") {
    query.spaceType = filters.workspaceType;
  }

  if (filters.ownerId && filters.ownerId !== "all") {
    query.owner = filters.ownerId;
  }

  if (filters.createdFrom || filters.createdTo) {
    query.createdAt = {};
    if (filters.createdFrom) {
      query.createdAt.$gte = new Date(filters.createdFrom);
    }
    if (filters.createdTo) {
      const end = new Date(filters.createdTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const search = String(filters.search || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    const ownerIds = await findOwnerIds(search);
    const searchConditions = [
      { name: regex },
      { slug: regex },
      { "buildingInfo.name": regex },
    ];

    if (mongoose.Types.ObjectId.isValid(search)) {
      searchConditions.push({ _id: search });
    }

    if (ownerIds.length) {
      searchConditions.push({ owner: { $in: ownerIds } });
    }

    query.$or = searchConditions;
  }

  return query;
}

function mapOptions(values = []) {
  return [...new Set(values.filter(Boolean).map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export async function listSuperAdminSpaces(filters = {}) {
  const page = normalizePage(filters.page);
  const limit = normalizeLimit(filters.limit);
  const query = await buildQuery(filters);

  const [
    items,
    total,
    approvalCounts,
    operationalCounts,
    totalSpaces,
    cities,
    optionSpaces,
  ] = await Promise.all([
    Space.find(query)
      .populate("owner", "username email phoneNumber role")
      .populate("address.city", "name slug")
      .sort(normalizeSort(filters.sort))
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec(),
    Space.countDocuments(query),
    Space.aggregate([
      { $group: { _id: "$approvalStatus", count: { $sum: 1 } } },
    ]),
    Space.aggregate([
      { $group: { _id: "$operationalStatus", count: { $sum: 1 } } },
    ]),
    Space.countDocuments({}),
    City.find({}).select("_id name slug").sort({ name: 1 }).lean().exec(),
    Space.find({})
      .select("address.state address.country spaceType owner")
      .lean()
      .exec(),
  ]);

  const ownerIds = items.map((item) => item.owner?._id).filter(Boolean);
  const profiles = ownerIds.length
    ? await AdminProfile.find({ owner: { $in: ownerIds } })
        .select("owner company.name")
        .lean()
        .exec()
    : [];
  const profileMap = new Map(
    profiles.map((profile) => [String(profile.owner), profile]),
  );
  const spaceIds = items.map((item) => item._id);
  const resourceCounts = spaceIds.length
    ? await Resource.aggregate([
        { $match: { space: { $in: spaceIds }, isActive: { $ne: false } } },
        { $group: { _id: "$space", count: { $sum: 1 } } },
      ])
    : [];
  const resourceCountMap = new Map(
    resourceCounts.map((item) => [String(item._id), item.count]),
  );

  const normalizedItems = items.map((item) => {
    const ownerId = item.owner?._id ? String(item.owner._id) : "";
    const profile = profileMap.get(ownerId);

    return {
      ...item,
      owner: item.owner
        ? {
            ...item.owner,
            id: ownerId,
            name: item.owner.username || profile?.company?.name || "Owner",
            companyName: profile?.company?.name || "",
          }
        : null,
      activeResources: resourceCountMap.get(String(item._id)) || 0,
    };
  });
  const countMap = (rows) =>
    Object.fromEntries(rows.map((item) => [item._id || "active", item.count]));
  const operational = countMap(operationalCounts);

  return {
    items: normalizedItems,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
    stats: {
      total: totalSpaces,
      approval: countMap(approvalCounts),
      operational: {
        ...operational,
        active: totalSpaces - (operational.suspended || 0),
      },
    },
    filters: {
      cities: cities.map((city) => ({
        value: String(city._id),
        label: city.name || city.slug,
      })),
      states: mapOptions(optionSpaces.map((item) => item.address?.state)),
      countries: mapOptions(optionSpaces.map((item) => item.address?.country)),
      workspaceTypes: mapOptions(optionSpaces.map((item) => item.spaceType)),
    },
  };
}

export async function updateSuperAdminSpaceStatus({
  spaceId,
  action,
  notes = "",
  actor,
}) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error("Unsupported space action");
  }

  const space = await Space.findById(spaceId);
  if (!space) {
    const error = new Error("Space not found");
    error.status = 404;
    throw error;
  }

  const previousState = buildSpaceState(space);
  const now = new Date();

  if (action === "approve") {
    if (!space.internalFlags) space.internalFlags = {};
    space.approvalStatus = "approved";
    space.internalFlags.verified = true;
    space.approvalReviewedAt = now;
    space.approvalReviewedBy = actor?._id || null;
  } else if (action === "reject") {
    if (!space.internalFlags) space.internalFlags = {};
    space.approvalStatus = "rejected";
    space.internalFlags.verified = false;
    space.approvalReviewedAt = now;
    space.approvalReviewedBy = actor?._id || null;
    space.isPublished = false;
    space.status = "DRAFT";
  } else if (action === "suspend") {
    space.operationalStatus = "suspended";
    space.suspendedAt = now;
    space.suspendedBy = actor?._id || null;
    space.isPublished = false;
    space.status = "DRAFT";
  } else if (action === "restore") {
    space.operationalStatus = "active";
    space.suspendedAt = null;
    space.suspendedBy = null;
  } else if (action === "publish") {
    if (space.approvalStatus !== "approved") {
      throw new Error("Approve the space before publishing it");
    }
    if (space.operationalStatus === "suspended") {
      throw new Error("Restore the space before publishing it");
    }
    space.isPublished = true;
    space.status = "PUBLISHED";
  } else if (action === "unpublish") {
    space.isPublished = false;
    space.status = "DRAFT";
  }

  if (notes !== undefined) {
    space.adminNotes = String(notes || "").trim();
  }

  await space.save();

  await MarketplaceAudit.create({
    entityType: "space",
    entityId: space._id,
    action: `space.${action}`,
    actorId: actor?._id || null,
    actorRole: actor?.role || "",
    previousState,
    nextState: buildSpaceState(space),
    notes: String(notes || "").trim(),
  });

  return space.toObject();
}

export async function listSpaceAudit(spaceId, { limit = 30 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  return MarketplaceAudit.find({ entityType: "space", entityId: spaceId })
    .populate("actorId", "username email role")
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean()
    .exec();
}
