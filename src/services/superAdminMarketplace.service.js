import Space from "../models/admin_models/Space.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import Offer from "../models/admin_models/Offer.js";
import SpaceDocument from "../models/admin_models/SpaceDocument.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import Booking from "../models/user_models/Booking.js";
import User from "../models/user_models/User.js";
import Review from "../models/user_models/Review.js";
import City from "../models/super_admin_models/City.model.js";

const isTrue = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

const toId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id && value._id !== value) return toId(value._id);
  if (value.id && value.id !== value) return String(value.id);
  return String(value);
};

const uniqueIds = (values = []) => [
  ...new Set(values.map((value) => toId(value)).filter(Boolean)),
];

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(toId(value) || "");

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function buildOwnerRecord(ownerId, userMap, profileMap) {
  const normalizedOwnerId = toId(ownerId);
  const user = userMap.get(normalizedOwnerId) || {};
  const profile = profileMap.get(normalizedOwnerId) || {};
  const companyName = profile.company?.name || user.username || "Owner";

  return {
    _id: normalizedOwnerId,
    id: normalizedOwnerId,
    name: user.username || companyName,
    email: user.email || "",
    phoneNumber: user.phoneNumber || "",
    phone: user.phoneNumber || "",
    role: user.role || "admin",
    companyName,
    company: profile.company || null,
    kyc: {
      status: profile.kyc?.status || user.kyc?.status || "not_submitted",
    },
    whiteLabel: profile.whiteLabel || null,
  };
}

function mapAddress(address = {}, cityMap = new Map()) {
  const cityId = toId(address.city);
  const city = cityMap.get(cityId);

  return {
    ...address,
    city:
      city?.name ||
      (typeof address.city === "string" ? address.city : cityId || "Unknown"),
    cityId,
  };
}

function buildActivityLogs({
  spaces = [],
  bookings = [],
  offers = [],
  resources = [],
  documents = [],
  whiteLabelRequests = [],
  reviews = [],
} = {}) {
  const logs = [];

  spaces.slice(0, 50).forEach((space) => {
    logs.push({
      _id: "space-" + toId(space._id),
      userId: space.owner?.id || null,
      userName: space.owner?.name || "Owner",
      action: "space.created",
      entityType: "space",
      entityName: space.name || "Workspace",
      details:
        (space.spaceType || "space").replaceAll("_", " ") +
        " listed in " +
        (space.address?.city || "Unknown"),
      createdAt: safeDate(space.createdAt || space.updatedAt),
      ipAddress: null,
    });
  });

  bookings.slice(0, 80).forEach((booking) => {
    logs.push({
      _id: "booking-" + toId(booking._id),
      userId: booking.user?.userId || null,
      userName: booking.user?.name || "Marketplace user",
      action: "booking." + String(booking.status || "created").toLowerCase(),
      entityType: "booking",
      entityName: booking.space?.name || "Workspace",
      details:
        "Payment " +
        String(booking.payment?.status || "pending").toLowerCase() +
        " • " +
        String(booking.priceBreakdown?.totalAmount || 0),
      createdAt: safeDate(booking.createdAt || booking.startDateTime),
      ipAddress: null,
    });
  });

  offers.slice(0, 40).forEach((offer) => {
    logs.push({
      _id: "offer-" + toId(offer._id),
      userId: offer.owner?.id || null,
      userName: offer.owner?.name || "Owner",
      action: "offer." + (offer.isActive === false ? "inactive" : "active"),
      entityType: "offer",
      entityName: offer.title || offer.code || "Offer",
      details: offer.space?.name || "Workspace",
      createdAt: safeDate(offer.createdAt || offer.updatedAt),
      ipAddress: null,
    });
  });

  resources.slice(0, 40).forEach((resource) => {
    logs.push({
      _id: "resource-" + toId(resource._id),
      userId: resource.owner?.id || null,
      userName: resource.owner?.name || "Owner",
      action: "resource." + (resource.isActive === false ? "inactive" : "active"),
      entityType: "resource",
      entityName: resource.name || "Resource",
      details: resource.space?.name || "Workspace",
      createdAt: safeDate(resource.createdAt || resource.updatedAt),
      ipAddress: null,
    });
  });

  documents.slice(0, 60).forEach((document) => {
    const status = String(
      document.reviewStatus || document.verificationStatus || "uploaded",
    ).toLowerCase();

    logs.push({
      _id: "document-" + toId(document._id),
      userId: document.owner?.id || null,
      userName: document.owner?.name || "Owner",
      action: "document." + status,
      entityType: "document",
      entityName: document.label || document.documentType || "Document",
      details: document.space?.name || "Workspace",
      createdAt: safeDate(
        document.reviewedAt || document.updatedAt || document.createdAt,
      ),
      ipAddress: null,
    });
  });

  whiteLabelRequests.slice(0, 40).forEach((request) => {
    logs.push({
      _id: "white-label-" + toId(request._id),
      userId: request.owner?.id || null,
      userName: request.owner?.name || "Owner",
      action:
        "white_label." +
        String(request.whiteLabel?.status || "pending").toLowerCase(),
      entityType: "white_label",
      entityName: request.company?.name || request.owner?.companyName || "Company",
      details:
        request.whiteLabel?.domain?.requestedDomain ||
        request.whiteLabel?.request?.requestedDomain ||
        "No requested domain",
      createdAt: safeDate(
        request.whiteLabel?.approvedAt ||
          request.whiteLabel?.request?.submittedAt ||
          request.updatedAt ||
          request.createdAt,
      ),
      ipAddress: null,
    });
  });

  reviews.slice(0, 60).forEach((review) => {
    logs.push({
      _id: "review-" + toId(review._id),
      userId: review.userId || null,
      userName: review.userName || "Marketplace user",
      action: "review.created",
      entityType: "review",
      entityName: review.space?.name || "Workspace",
      details: "Rating " + String(review.rating || 0) + "/5",
      createdAt: safeDate(review.createdAt),
      ipAddress: null,
    });
  });

  return logs
    .filter((log) => log.createdAt)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 200);
}

export async function getMarketplaceSnapshot(options = {}) {
  const includeDocuments = isTrue(options.includeDocuments);
  const includeWhiteLabels =
    options.includeWhiteLabels === undefined
      ? true
      : options.includeWhiteLabels !== false &&
        options.includeWhiteLabels !== "false";
  const includeReviews = isTrue(options.includeReviews);
  const includeActivity = isTrue(options.includeActivity);

  const [rawSpaces, rawResources, rawOffers, rawBookings, rawDocuments, rawWhiteLabels, rawReviews] =
    await Promise.all([
      Space.find({}).sort({ createdAt: -1 }).lean().exec(),
      Resource.find({}).sort({ createdAt: -1 }).lean().exec(),
      Offer.find({}).sort({ createdAt: -1 }).lean().exec(),
      Booking.find({})
        .populate({
          path: "user.userId",
          select: "username email phoneNumber kyc role",
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      includeDocuments || includeActivity
        ? SpaceDocument.find({
            scopeType: "SPACE",
            isActive: true,
          })
            .sort({ createdAt: -1 })
            .lean()
            .exec()
        : Promise.resolve([]),
      includeWhiteLabels || includeActivity
        ? AdminProfile.find({
            "whiteLabel.status": { $in: ["pending", "approved", "rejected"] },
          })
            .sort({ updatedAt: -1, createdAt: -1 })
            .lean()
            .exec()
        : Promise.resolve([]),
      includeReviews || includeActivity
        ? Review.find({})
            .sort({ createdAt: -1 })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

  const ownerIds = uniqueIds([
    ...rawSpaces.map((space) => space.owner),
    ...rawWhiteLabels.map((profile) => profile.owner),
  ]);
  const reviewUserIds = uniqueIds(rawReviews.map((review) => review.user));
  const userIds = uniqueIds([...ownerIds, ...reviewUserIds]);
  const cityIds = uniqueIds(rawSpaces.map((space) => space?.address?.city)).filter(
    isObjectId,
  );

  const [users, ownerProfiles, cities] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select("username email phoneNumber role kyc")
          .lean()
          .exec()
      : Promise.resolve([]),
    ownerIds.length
      ? AdminProfile.find({ owner: { $in: ownerIds } })
          .select("owner company kyc whiteLabel")
          .lean()
          .exec()
      : Promise.resolve([]),
    cityIds.length
      ? City.find({ _id: { $in: cityIds } })
          .select("_id name slug")
          .lean()
          .exec()
      : Promise.resolve([]),
  ]);

  const userMap = new Map(users.map((user) => [toId(user._id), user]));
  const profileMap = new Map(
    ownerProfiles.map((profile) => [toId(profile.owner), profile]),
  );
  const cityMap = new Map(cities.map((city) => [toId(city._id), city]));

  const groupedResources = new Map();
  rawResources.forEach((resource) => {
    const spaceId = toId(resource.space);
    if (!spaceId) return;
    if (!groupedResources.has(spaceId)) {
      groupedResources.set(spaceId, []);
    }
    groupedResources.get(spaceId).push(resource);
  });

  const normalizedSpaces = rawSpaces.map((space) => {
    const spaceId = toId(space._id);
    const owner = buildOwnerRecord(space.owner, userMap, profileMap);

    return {
      ...space,
      owner,
      address: mapAddress(space.address, cityMap),
      resources: groupedResources.get(spaceId) || [],
    };
  });

  const spaceMap = new Map(
    normalizedSpaces.map((space) => [toId(space._id), space]),
  );

  const normalizedResources = rawResources.map((resource) => {
    const relatedSpace = spaceMap.get(toId(resource.space)) || null;

    return {
      ...resource,
      space: relatedSpace,
      owner: relatedSpace?.owner || null,
    };
  });

  const normalizedOffers = rawOffers.map((offer) => {
    const relatedSpace = spaceMap.get(toId(offer.space)) || null;

    return {
      ...offer,
      space: relatedSpace,
      owner: relatedSpace?.owner || null,
    };
  });

  const normalizedBookings = rawBookings.map((booking) => {
    const relatedSpace = spaceMap.get(toId(booking.space)) || null;
    const userDoc = booking.user?.userId || null;

    return {
      ...booking,
      space: relatedSpace,
      spaceId: toId(booking.space),
      owner: relatedSpace?.owner || null,
      user: {
        ...booking.user,
        userId: toId(userDoc?._id || booking.user?.userId),
        name: userDoc?.username || booking.user?.name || "",
        email: userDoc?.email || booking.user?.email || "",
        phoneNumber: userDoc?.phoneNumber || booking.user?.phone || "",
        phone: userDoc?.phoneNumber || booking.user?.phone || "",
        kycStatus: userDoc?.kyc?.status || "not_submitted",
      },
    };
  });

  const normalizedDocuments = rawDocuments.map((document) => {
    const relatedSpace = spaceMap.get(toId(document.space)) || null;
    const reviewStatus =
      document.reviewStatus ||
      document.verificationStatus ||
      "pending";

    return {
      ...document,
      reviewStatus,
      verificationStatus: document.verificationStatus || reviewStatus,
      spaceId: toId(document.space),
      space: relatedSpace,
      owner: relatedSpace?.owner || null,
    };
  });

  const normalizedWhiteLabelRequests = rawWhiteLabels.map((profile) => {
    const owner = buildOwnerRecord(profile.owner, userMap, profileMap);

    return {
      ...profile,
      owner,
      company: {
        ...(profile.company || {}),
        name: profile.company?.name || owner.companyName || "",
      },
      createdAt:
        profile.whiteLabel?.request?.submittedAt ||
        profile.createdAt,
    };
  });

  const normalizedReviews = rawReviews.map((review) => {
    const relatedSpace = spaceMap.get(toId(review.space)) || null;
    const reviewer = userMap.get(toId(review.user)) || null;
    const content = review.review || review.comment || "";

    return {
      ...review,
      space: relatedSpace,
      owner: relatedSpace?.owner || null,
      userId: toId(review.user),
      userName:
        reviewer?.username ||
        reviewer?.email ||
        "Marketplace user",
      title: content ? content.slice(0, 72) : "Review",
      content,
      review: content,
    };
  });

  const activityLogs = includeActivity
    ? buildActivityLogs({
        spaces: normalizedSpaces,
        bookings: normalizedBookings,
        offers: normalizedOffers,
        resources: normalizedResources,
        documents: normalizedDocuments,
        whiteLabelRequests: normalizedWhiteLabelRequests,
        reviews: normalizedReviews,
      })
    : [];

  const ownerCount = uniqueIds(
    normalizedSpaces.map((space) => space.owner?.id),
  ).length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    totalAdmins,
    newUsers,
    activeUsers,
    pendingKyc,
    companyNames,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: { $in: ["admin", "super_admin"] } }),
    User.countDocuments({ createdAt: { $gte: monthStart } }),
    User.countDocuments({ lastLogin: { $gte: activeSince } }),
    AdminProfile.countDocuments({ "kyc.status": "pending" }),
    AdminProfile.distinct("company.name", {
      "company.name": { $nin: ["", "GLOBAL_DEFAULT", null] },
    }),
  ]);
  const spaceApprovalStatus = normalizedSpaces.reduce(
    (result, space) => {
      const status = space.approvalStatus || "pending";
      result[status] = (result[status] || 0) + 1;
      return result;
    },
    { pending: 0, approved: 0, rejected: 0 },
  );
  const whiteLabelApprovalStatus = normalizedWhiteLabelRequests.reduce(
    (result, profile) => {
      const status = profile.whiteLabel?.status || "pending";
      result[status] = (result[status] || 0) + 1;
      return result;
    },
    { pending: 0, approved: 0, rejected: 0 },
  );

  return {
    spaces: normalizedSpaces,
    bookings: normalizedBookings,
    offers: normalizedOffers,
    resources: normalizedResources,
    documents: includeDocuments ? normalizedDocuments : [],
    whiteLabelRequests: includeWhiteLabels
      ? normalizedWhiteLabelRequests
      : [],
    reviews: includeReviews ? normalizedReviews : [],
    activityLogs,
    analytics: {
      totalOwners: ownerCount,
      totalSpaces: normalizedSpaces.length,
      totalBookings: normalizedBookings.length,
      totalResources: normalizedResources.length,
      totalOffers: normalizedOffers.length,
      totalDocuments: normalizedDocuments.length,
      totalWhiteLabelRequests: normalizedWhiteLabelRequests.length,
      totalReviews: normalizedReviews.length,
      totalCompanies: companyNames.length,
      totalAdmins,
      totalUsers,
      newUsers,
      activeUsers,
      pendingKyc,
      pendingSpaces: spaceApprovalStatus.pending,
      approvedSpaces: spaceApprovalStatus.approved,
      rejectedSpaces: spaceApprovalStatus.rejected,
      pendingSaaS: whiteLabelApprovalStatus.pending,
      approvedSaaS: whiteLabelApprovalStatus.approved,
      rejectedSaaS: whiteLabelApprovalStatus.rejected,
    },
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };
}
