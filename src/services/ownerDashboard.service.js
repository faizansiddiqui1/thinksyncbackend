import Space from "../models/admin_models/Space.js";
import PricingPlan from "../models/admin_models/PricingPlan.js";
import Offer from "../models/admin_models/Offer.js";
import Resource from "../models/admin_models/ResourceSchema.js";
import Addon from "../models/admin_models/AddonSchema.js";
import Booking from "../models/user_models/Booking.js";
import Review from "../models/user_models/Review.js";
import { getScopeOwnerId } from "./spaceAccess.service.js";
import { getReviewInsightsForSpaceIds } from "./review.service.js";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function monthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildTrendBuckets(months = 6) {
  const safeMonths = Math.min(Math.max(Number(months) || 6, 3), 12);
  const currentMonthStart = startOfMonth(new Date());
  const firstMonth = addMonths(currentMonthStart, -(safeMonths - 1));

  return Array.from({ length: safeMonths }, (_, index) => {
    const date = addMonths(firstMonth, index);
    return {
      key: monthKey(date),
      label: monthLabel(date),
      bookingCount: 0,
      revenue: 0,
      occupiedSpaceCount: 0,
      occupancyRate: 0,
      occupiedSpaceIds: new Set(),
    };
  });
}

function formatCity(city) {
  if (!city) return "City not set";
  if (typeof city === "string") return city;
  return city?.name || city?.slug || "City not set";
}

function serializeRecentSpace(space) {
  return {
    id: space._id,
    name: space.name,
    status: space.status,
    spaceType: space.spaceType,
    city: formatCity(space.address?.city),
    createdAt: space.createdAt,
    isPublished: !!space.isPublished,
    reviewCount: space.reviewCount || 0,
    averageRating: space.averageRating || 0,
  };
}

function bookingStatusCounts(bookings = []) {
  return bookings.reduce(
    (acc, booking) => {
      const key = String(booking.status || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {
      pending_hold: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      completed: 0,
      expired: 0,
      no_show: 0,
    },
  );
}

export async function getOwnerDashboardSnapshot(user, { months = 6 } = {}) {
  const ownerId = await getScopeOwnerId(user);
  if (!ownerId) {
    throw new Error("Unauthorized");
  }

  const spaces = await Space.find({ owner: ownerId })
    .populate("address.city", "name slug")
    .sort({ createdAt: -1 })
    .lean();

  const spaceIds = spaces.map((space) => space._id);
  const totalSpaces = spaces.length;
  const trendBuckets = buildTrendBuckets(months);
  const trendMap = new Map(trendBuckets.map((bucket) => [bucket.key, bucket]));

  if (!spaceIds.length) {
    return {
      metrics: {
        totalSpaces: 0,
        publishedSpaces: 0,
        draftSpaces: 0,
        totalBookings: 0,
        activeBookings: 0,
        completedBookings: 0,
        totalRevenue: 0,
        pendingPayments: 0,
        occupancyRate: 0,
        activePlans: 0,
        activeOffers: 0,
        activeResources: 0,
        activeAddons: 0,
        totalReviews: 0,
        resourceUsageCount: 0,
        addonUsageCount: 0,
        averageRating: 0,
      },
      bookingsByStatus: bookingStatusCounts([]),
      trends: trendBuckets.map(({ occupiedSpaceIds, ...bucket }) => bucket),
      recentBookings: [],
      recentSpaces: [],
      topSpaces: [],
      reviewSummary: {
        totalReviews: 0,
        averageRating: 0,
        publishedReviews: 0,
        hiddenReviews: 0,
        respondedReviews: 0,
        ratingBreakdown: [
          { rating: 5, count: 0 },
          { rating: 4, count: 0 },
          { rating: 3, count: 0 },
          { rating: 2, count: 0 },
          { rating: 1, count: 0 },
        ],
        recentReviews: [],
      },
    };
  }

  const [
    activePlans,
    activeOffers,
    activeResources,
    activeAddons,
    totalReviews,
    bookings,
    reviewInsightsResult,
  ] = await Promise.all([
    PricingPlan.countDocuments({ space: { $in: spaceIds }, isActive: true }),
    Offer.countDocuments({ space: { $in: spaceIds }, isActive: true }),
    Resource.countDocuments({ space: { $in: spaceIds }, isActive: true }),
    Addon.countDocuments({ space: { $in: spaceIds }, isActive: true }),
    Review.countDocuments({ space: { $in: spaceIds } }),
    Booking.find({ space: { $in: spaceIds } })
      .populate("space", "name slug address")
      .sort({ createdAt: -1 })
      .lean(),
    getReviewInsightsForSpaceIds(spaceIds, { recentLimit: 5 }),
  ]);

  const now = new Date();
  const publishedSpaces = spaces.filter((space) => space.isPublished).length;
  const draftSpaces = totalSpaces - publishedSpaces;
  const activeBookings = bookings.filter((booking) => {
    const start = booking.startDateTime ? new Date(booking.startDateTime) : null;
    const end = booking.endDateTime ? new Date(booking.endDateTime) : null;
    return (
      start &&
      end &&
      start <= now &&
      end >= now &&
      ["confirmed", "pending", "pending_hold"].includes(booking.status)
    );
  }).length;
  const completedBookings = bookings.filter(
    (booking) => booking.status === "completed",
  ).length;
  const totalRevenue = bookings
    .filter((booking) => booking.payment?.status === "paid")
    .reduce(
      (sum, booking) => sum + Number(booking.priceBreakdown?.totalAmount || 0),
      0,
    );
  const pendingPayments = bookings
    .filter((booking) => booking.payment?.status === "pending")
    .reduce(
      (sum, booking) => sum + Number(booking.priceBreakdown?.totalAmount || 0),
      0,
    );
  const resourceUsageCount = bookings.reduce((sum, booking) => {
    const count = Array.isArray(booking.resources)
      ? booking.resources.reduce(
          (resourceSum, resource) =>
            resourceSum + Number(resource.quantity || 1),
          0,
        )
      : 0;
    return sum + count;
  }, 0);
  const addonUsageCount = bookings.reduce((sum, booking) => {
    const count = Array.isArray(booking.addons)
      ? booking.addons.reduce(
          (addonSum, addon) => addonSum + Number(addon.quantity || 1),
          0,
        )
      : 0;
    return sum + count;
  }, 0);
  const averageRating =
    totalSpaces > 0
      ? Number(
          (
            spaces.reduce(
              (sum, space) => sum + Number(space.averageRating || 0),
              0,
            ) / totalSpaces
          ).toFixed(1),
        )
      : 0;
  const occupiedSpaceIds = new Set(
    activeBookings > 0
      ? bookings
          .filter((booking) => {
            const start = booking.startDateTime
              ? new Date(booking.startDateTime)
              : null;
            const end = booking.endDateTime ? new Date(booking.endDateTime) : null;
            return (
              start &&
              end &&
              start <= now &&
              end >= now &&
              ["confirmed", "pending", "pending_hold"].includes(booking.status)
            );
          })
          .map((booking) => String(booking.space?._id || booking.space))
      : [],
  );
  const occupancyRate = totalSpaces
    ? Math.round((occupiedSpaceIds.size / totalSpaces) * 100)
    : 0;

  const topSpaceMap = new Map(
    spaces.map((space) => [
      String(space._id),
      {
        id: space._id,
        name: space.name,
        city: formatCity(space.address?.city),
        status: space.status,
        bookings: 0,
        revenue: 0,
        reviewCount: space.reviewCount || 0,
        averageRating: space.averageRating || 0,
      },
    ]),
  );

  bookings.forEach((booking) => {
    const bucket = trendMap.get(monthKey(new Date(booking.createdAt)));
    const spaceId = String(booking.space?._id || booking.space || "");

    if (bucket) {
      bucket.bookingCount += 1;
      if (booking.payment?.status === "paid") {
        bucket.revenue += Number(booking.priceBreakdown?.totalAmount || 0);
      }
      if (
        ["confirmed", "completed", "pending", "pending_hold"].includes(
          booking.status,
        ) &&
        spaceId
      ) {
        bucket.occupiedSpaceIds.add(spaceId);
      }
    }

    const topSpace = topSpaceMap.get(spaceId);
    if (topSpace) {
      topSpace.bookings += 1;
      if (booking.payment?.status === "paid") {
        topSpace.revenue += Number(booking.priceBreakdown?.totalAmount || 0);
      }
    }
  });

  const trends = trendBuckets.map(({ occupiedSpaceIds: ids, ...bucket }) => ({
    ...bucket,
    occupancyRate: totalSpaces ? Math.round((ids.size / totalSpaces) * 100) : 0,
  }));

  const recentBookings = bookings.slice(0, 6).map((booking) => ({
    id: booking._id,
    status: booking.status,
    paymentStatus: booking.payment?.status || "pending",
    totalAmount: Number(booking.priceBreakdown?.totalAmount || 0),
    customerName: booking.user?.name || booking.user?.email || "Customer",
    customerEmail: booking.user?.email || "",
    startDateTime: booking.startDateTime,
    endDateTime: booking.endDateTime,
    createdAt: booking.createdAt,
    space: {
      id: booking.space?._id || booking.space,
      name: booking.space?.name || "Workspace",
      city: formatCity(booking.space?.address?.city),
    },
  }));

  const recentSpaces = spaces.slice(0, 6).map(serializeRecentSpace);
  const topSpaces = Array.from(topSpaceMap.values())
    .sort((left, right) => {
      if (right.revenue !== left.revenue) return right.revenue - left.revenue;
      return right.bookings - left.bookings;
    })
    .slice(0, 6);
  const reviewSummary = reviewInsightsResult?.success
    ? reviewInsightsResult.data
    : {
        totalReviews,
        averageRating,
        publishedReviews: 0,
        hiddenReviews: 0,
        respondedReviews: 0,
        ratingBreakdown: [],
        recentReviews: [],
      };

  return {
    metrics: {
      totalSpaces,
      publishedSpaces,
      draftSpaces,
      totalBookings: bookings.length,
      activeBookings,
      completedBookings,
      totalRevenue,
      pendingPayments,
      occupancyRate,
      activePlans,
      activeOffers,
      activeResources,
      activeAddons,
      totalReviews,
      resourceUsageCount,
      addonUsageCount,
      averageRating,
    },
    bookingsByStatus: bookingStatusCounts(bookings),
    trends,
    recentBookings,
    recentSpaces,
    topSpaces,
    reviewSummary,
  };
}
