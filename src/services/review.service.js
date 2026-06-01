import mongoose from "mongoose";
import Booking from "../models/user_models/Booking.js";
import Review from "../models/user_models/Review.js";
import Space from "../models/admin_models/Space.js";
import { getOwnedSpaceIds } from "./spaceAccess.service.js";

const PAID_BOOKING_FILTER = {
  $or: [
    { paymentStatus: "paid" },
    { "payment.status": "paid" },
  ],
};

function normalizePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDate(value, { endOfDay = false } = {}) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function buildRatingBreakdown(raw = []) {
  const counts = new Map(
    raw.map((item) => [Number(item._id || item.rating || 0), Number(item.count || 0)]),
  );

  return [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: counts.get(rating) || 0,
  }));
}

async function refreshSpaceReviewStats(spaceId) {
  const [summary] = await Review.aggregate([
    {
      $match: {
        space: spaceId,
        isPublished: true,
      },
    },
    {
      $group: {
        _id: "$space",
        totalReviews: { $sum: 1 },
        averageRating: { $avg: "$rating" },
      },
    },
  ]);

  await Space.findByIdAndUpdate(spaceId, {
    averageRating: summary?.averageRating
      ? Math.round(summary.averageRating * 10) / 10
      : 0,
    reviewCount: summary?.totalReviews || 0,
  });
}

function normalizeReviewPayload(payload = {}) {
  return {
    rating: Number(payload.rating),
    comment: String(payload.comment || "").trim(),
  };
}

function buildAdminReviewMatch(filters = {}, scopedSpaceIds = null) {
  const match = {};

  if (Array.isArray(scopedSpaceIds)) {
    if (!scopedSpaceIds.length) {
      return { _id: null };
    }

    match.space = { $in: scopedSpaceIds };
  }

  if (filters.spaceId && mongoose.Types.ObjectId.isValid(String(filters.spaceId))) {
    const spaceId = new mongoose.Types.ObjectId(String(filters.spaceId));

    if (
      Array.isArray(scopedSpaceIds) &&
      !scopedSpaceIds.some((id) => String(id) === String(spaceId))
    ) {
      return { _id: null };
    }

    match.space = spaceId;
  }

  const rating = Number(filters.rating || 0);
  if (rating >= 1 && rating <= 5) {
    match.rating = rating;
  }

  if (filters.visibility === "published") {
    match.isPublished = true;
  }

  if (filters.visibility === "hidden") {
    match.isPublished = false;
  }

  if (filters.flagged === true) {
    match.isFlagged = true;
  }

  if (filters.responseStatus === "responded") {
    match["response.respondedAt"] = { $ne: null };
  }

  if (filters.responseStatus === "pending") {
    match.$or = [
      { "response.respondedAt": null },
      { "response.respondedAt": { $exists: false } },
    ];
  }

  const startDate = normalizeDate(filters.startDate);
  const endDate = normalizeDate(filters.endDate, { endOfDay: true });
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }

  return match;
}

function buildAdminReviewLookupPipeline(match = {}, search = "") {
  const pipeline = [{ $match: match }];

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userData",
        pipeline: [
          {
            $project: {
              username: 1,
              name: 1,
              email: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: "$userData",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "spaces",
        localField: "space",
        foreignField: "_id",
        as: "spaceData",
        pipeline: [
          {
            $project: {
              name: 1,
              slug: 1,
              spaceType: 1,
              owner: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: "$spaceData",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "bookings",
        localField: "booking",
        foreignField: "_id",
        as: "bookingData",
        pipeline: [
          {
            $project: {
              startDateTime: 1,
              endDateTime: 1,
              status: 1,
              paymentStatus: 1,
              payment: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: "$bookingData",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch) {
    const regex = new RegExp(escapeRegex(normalizedSearch), "i");
    pipeline.push({
      $match: {
        $or: [
          { comment: regex },
          { adminNotes: regex },
          { "userData.username": regex },
          { "userData.name": regex },
          { "userData.email": regex },
          { "spaceData.name": regex },
          { "spaceData.slug": regex },
        ],
      },
    });
  }

  return pipeline;
}

function buildAdminReviewProjection() {
  return {
    $project: {
      _id: 1,
      rating: 1,
      comment: 1,
      verifiedBooking: 1,
      isApproved: 1,
      isPublished: 1,
      isFlagged: 1,
      adminNotes: 1,
      helpful: 1,
      createdAt: 1,
      updatedAt: 1,
      response: {
        message: "$response.message",
        respondedAt: "$response.respondedAt",
        respondedBy: "$response.respondedBy",
      },
      user: {
        _id: "$userData._id",
        username: {
          $ifNull: ["$userData.username", "$userData.name"],
        },
        email: "$userData.email",
      },
      space: {
        _id: "$spaceData._id",
        name: "$spaceData.name",
        slug: "$spaceData.slug",
        spaceType: "$spaceData.spaceType",
      },
      booking: {
        _id: "$bookingData._id",
        startDateTime: "$bookingData.startDateTime",
        endDateTime: "$bookingData.endDateTime",
        status: "$bookingData.status",
        paymentStatus: {
          $ifNull: ["$bookingData.paymentStatus", "$bookingData.payment.status"],
        },
      },
    },
  };
}

async function getScopedSpaceIds(user) {
  return getOwnedSpaceIds(user);
}

async function getAccessibleWorkspaceOptions(scopedSpaceIds = null) {
  const query = {};

  if (Array.isArray(scopedSpaceIds)) {
    if (!scopedSpaceIds.length) return [];
    query._id = { $in: scopedSpaceIds };
  }

  const spaces = await Space.find(query)
    .select("_id name slug spaceType")
    .sort({ name: 1 })
    .lean();

  return spaces.map((space) => ({
    _id: space._id,
    name: space.name,
    slug: space.slug,
    spaceType: space.spaceType || "workspace",
  }));
}

export async function createReview({
  userId,
  bookingId,
  rating,
  comment,
}) {
  try {
    const normalized = normalizeReviewPayload({ rating, comment });

    const booking = await Booking.findOne({
      _id: bookingId,
      "user.userId": userId,
      status: "completed",
      ...PAID_BOOKING_FILTER,
    }).lean();

    if (!booking) {
      return {
        success: false,
        error: "Only completed paid bookings are eligible for review",
      };
    }

    if (booking.reviewSubmitted) {
      return {
        success: false,
        error: "Review already submitted for this booking",
      };
    }

    const existingReview = await Review.findOne({
      booking: bookingId,
    }).lean();

    if (existingReview) {
      return {
        success: false,
        error: "Review already exists for this booking",
      };
    }

    const review = await Review.create({
      booking: booking._id,
      space: booking.space,
      user: userId,
      rating: normalized.rating,
      comment: normalized.comment,
      verifiedBooking: true,
      isApproved: true,
      isPublished: true,
    });

    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          reviewSubmitted: true,
          reviewNotificationPending: false,
        },
      },
    );

    await refreshSpaceReviewStats(booking.space);

    return {
      success: true,
      data: review,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getPendingReviewPrompts(userId) {
  try {
    const bookings = await Booking.find({
      "user.userId": userId,
      status: "completed",
      ...PAID_BOOKING_FILTER,
      reviewSubmitted: false,
      reviewNotificationPending: true,
    })
      .populate("space", "name slug address timezone spaceType")
      .sort({ endDateTime: -1 })
      .lean();

    return {
      success: true,
      data: bookings.map((booking) => ({
        bookingId: booking._id,
        reviewLink: `${process.env.FRONTEND_URL || "http://localhost:3000"}/bookings/${booking._id}/review`,
        workspaceName: booking.space?.name || "Workspace",
        bookingDate: booking.startDateTime || booking.bookingDuration?.startDate,
        booking,
      })),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getReviewById(id) {
  try {
    const review = await Review.findById(id)
      .populate("space", "name slug")
      .populate("user", "username email")
      .populate("booking", "startDateTime endDateTime status paymentStatus payment.status");

    if (!review) {
      return { success: false, error: "Review not found" };
    }

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getSpaceReviews(spaceId, filters = {}) {
  try {
    const {
      rating,
      verifiedOnly,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
    } = filters;

    const normalizedSpaceId = mongoose.Types.ObjectId.isValid(String(spaceId))
      ? new mongoose.Types.ObjectId(String(spaceId))
      : spaceId;
    const query = { space: normalizedSpaceId, isPublished: true };

    if (rating) query.rating = rating;
    if (verifiedOnly) query.verifiedBooking = true;

    const safePage = normalizePositiveInt(page, 1);
    const safeLimit = Math.min(normalizePositiveInt(limit, 20), 50);
    const skip = (safePage - 1) * safeLimit;
    const sort = { [sortBy]: -1 };

    const reviews = await Review.find(query)
      .populate("user", "username")
      .sort(sort)
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Review.countDocuments(query);

    const ratingDistribution = await Review.aggregate([
      { $match: { space: normalizedSpaceId, isPublished: true } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    return {
      success: true,
      data: {
        reviews,
        ratingDistribution: buildRatingBreakdown(ratingDistribution),
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1,
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserReviews(userId, filters = {}) {
  try {
    const safePage = normalizePositiveInt(filters.page, 1);
    const safeLimit = Math.min(normalizePositiveInt(filters.limit, 20), 50);
    const skip = (safePage - 1) * safeLimit;

    const reviews = await Review.find({ user: userId })
      .populate("space", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean();

    const total = await Review.countDocuments({ user: userId });

    return {
      success: true,
      data: {
        reviews,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1,
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAdminReviews(user, filters = {}) {
  try {
    const scopedSpaceIds = await getScopedSpaceIds(user);
    const safePage = normalizePositiveInt(filters.page, 1);
    const safeLimit = Math.min(normalizePositiveInt(filters.limit, 10), 50);
    const skip = (safePage - 1) * safeLimit;
    const sortField = filters.sortBy === "rating" ? "rating" : "createdAt";
    const sortDirection = filters.sortDirection === "asc" ? 1 : -1;
    const match = buildAdminReviewMatch(filters, scopedSpaceIds);
    const basePipeline = buildAdminReviewLookupPipeline(match, filters.search);

    const totalPipeline = [...basePipeline, { $count: "total" }];
    const listPipeline = [
      ...basePipeline,
      { $sort: { [sortField]: sortDirection, createdAt: -1 } },
      { $skip: skip },
      { $limit: safeLimit },
      buildAdminReviewProjection(),
    ];

    const [countResult, reviews] = await Promise.all([
      Review.aggregate(totalPipeline),
      Review.aggregate(listPipeline),
    ]);

    const total = Number(countResult?.[0]?.total || 0);

    return {
      success: true,
      data: {
        reviews,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          pages: Math.ceil(total / safeLimit) || 1,
        },
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAdminReviewSummary(user, filters = {}) {
  try {
    const scopedSpaceIds = await getScopedSpaceIds(user);
    const match = buildAdminReviewMatch(filters, scopedSpaceIds);
    const basePipeline = buildAdminReviewLookupPipeline(match, filters.search);
    const summaryPipeline = [
      ...basePipeline,
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalReviews: { $sum: 1 },
                averageRating: { $avg: "$rating" },
                publishedReviews: {
                  $sum: {
                    $cond: [{ $eq: ["$isPublished", true] }, 1, 0],
                  },
                },
                hiddenReviews: {
                  $sum: {
                    $cond: [{ $eq: ["$isPublished", false] }, 1, 0],
                  },
                },
                respondedReviews: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ["$response", null] },
                          { $ne: ["$response.respondedAt", null] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          ratingBreakdown: [
            {
              $group: {
                _id: "$rating",
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: -1 } },
          ],
          recentReviews: [
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            buildAdminReviewProjection(),
          ],
        },
      },
    ];

    const [summaryResult, workspaceOptions] = await Promise.all([
      Review.aggregate(summaryPipeline),
      getAccessibleWorkspaceOptions(scopedSpaceIds),
    ]);

    const overview = summaryResult?.[0]?.overview?.[0] || {};
    const ratingBreakdown = buildRatingBreakdown(
      summaryResult?.[0]?.ratingBreakdown || [],
    );
    const recentReviews = summaryResult?.[0]?.recentReviews || [];

    return {
      success: true,
      data: {
        totalReviews: Number(overview.totalReviews || 0),
        averageRating: Number((overview.averageRating || 0).toFixed?.(1) || 0),
        publishedReviews: Number(overview.publishedReviews || 0),
        hiddenReviews: Number(overview.hiddenReviews || 0),
        respondedReviews: Number(overview.respondedReviews || 0),
        ratingBreakdown,
        recentReviews,
        workspaceOptions,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getReviewInsightsForSpaceIds(
  spaceIds = [],
  { recentLimit = 5 } = {},
) {
  try {
    if (!Array.isArray(spaceIds) || !spaceIds.length) {
      return {
        success: true,
        data: {
          totalReviews: 0,
          averageRating: 0,
          publishedReviews: 0,
          hiddenReviews: 0,
          respondedReviews: 0,
          ratingBreakdown: buildRatingBreakdown([]),
          recentReviews: [],
        },
      };
    }

    const query = { space: { $in: spaceIds } };
    const [overviewResult, ratingBreakdownRaw, recentReviews] = await Promise.all([
      Review.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            averageRating: { $avg: "$rating" },
            publishedReviews: {
              $sum: {
                $cond: [{ $eq: ["$isPublished", true] }, 1, 0],
              },
            },
            hiddenReviews: {
              $sum: {
                $cond: [{ $eq: ["$isPublished", false] }, 1, 0],
              },
            },
            respondedReviews: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$response", null] },
                      { $ne: ["$response.respondedAt", null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Review.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
      ]),
      Review.find(query)
        .populate("user", "username name email")
        .populate("space", "name slug spaceType")
        .populate("booking", "startDateTime endDateTime status paymentStatus payment.status")
        .sort({ createdAt: -1 })
        .limit(Math.max(1, Number(recentLimit || 5)))
        .lean(),
    ]);

    const overview = overviewResult?.[0] || {};

    return {
      success: true,
      data: {
        totalReviews: Number(overview.totalReviews || 0),
        averageRating: Number((overview.averageRating || 0).toFixed?.(1) || 0),
        publishedReviews: Number(overview.publishedReviews || 0),
        hiddenReviews: Number(overview.hiddenReviews || 0),
        respondedReviews: Number(overview.respondedReviews || 0),
        ratingBreakdown: buildRatingBreakdown(ratingBreakdownRaw),
        recentReviews: recentReviews.map((review) => ({
          _id: review._id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          isPublished: review.isPublished,
          isFlagged: review.isFlagged,
          response: review.response,
          user: {
            _id: review.user?._id || null,
            username:
              review.user?.username ||
              review.user?.name ||
              review.user?.email ||
              "Marketplace user",
            email: review.user?.email || "",
          },
          space: {
            _id: review.space?._id || null,
            name: review.space?.name || "Workspace",
            slug: review.space?.slug || "",
            spaceType: review.space?.spaceType || "workspace",
          },
          booking: review.booking || null,
        })),
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateReview(id, userId, updateData) {
  try {
    const review = await Review.findOne({
      _id: id,
      user: userId,
    });

    if (!review) {
      return {
        success: false,
        error: "Review not found or unauthorized",
      };
    }

    if (updateData.rating !== undefined) {
      review.rating = Number(updateData.rating);
    }

    if (updateData.comment !== undefined) {
      review.comment = String(updateData.comment || "").trim();
    }

    await review.save();
    await refreshSpaceReviewStats(review.space);

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteReview(id, userId, isAdmin = false) {
  try {
    const query = { _id: id };

    if (!isAdmin) {
      query.user = userId;
    }

    const review = await Review.findOneAndDelete(query);
    if (!review) {
      return {
        success: false,
        error: "Review not found or unauthorized",
      };
    }

    if (review.booking) {
      await Booking.updateOne(
        { _id: review.booking },
        {
          $set: {
            reviewSubmitted: false,
            reviewNotificationPending: true,
          },
        },
      );
    }

    await refreshSpaceReviewStats(review.space);

    return {
      success: true,
      message: "Review deleted successfully",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function addResponse(id, responseData, actorId = null) {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: "Review not found" };
    }

    review.response = {
      message: String(responseData?.message || "").trim(),
      respondedBy: actorId,
      respondedAt: new Date(),
    };

    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function markHelpful(id, userId) {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: "Review not found" };
    }

    const alreadyMarked = review.helpful.users.some(
      (item) => item.toString() === userId.toString(),
    );

    if (alreadyMarked) {
      review.helpful.users = review.helpful.users.filter(
        (item) => item.toString() !== userId.toString(),
      );
      review.helpful.count = Math.max(0, review.helpful.count - 1);
    } else {
      review.helpful.users.push(userId);
      review.helpful.count += 1;
    }

    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function flagReview(id, reason) {
  try {
    const review = await Review.findByIdAndUpdate(
      id,
      {
        isFlagged: true,
        adminNotes: String(reason || "").trim(),
      },
      { new: true },
    );

    if (!review) {
      return { success: false, error: "Review not found" };
    }

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function togglePublish(id, nextValue) {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: "Review not found" };
    }

    review.isPublished =
      typeof nextValue === "boolean" ? nextValue : !review.isPublished;
    await review.save();
    await refreshSpaceReviewStats(review.space);

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function moderateReview(id, payload = {}) {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: "Review not found" };
    }

    if (typeof payload.isPublished === "boolean") {
      review.isPublished = payload.isPublished;
    }

    if (typeof payload.isApproved === "boolean") {
      review.isApproved = payload.isApproved;
    }

    if (typeof payload.isFlagged === "boolean") {
      review.isFlagged = payload.isFlagged;
    }

    if (payload.adminNotes !== undefined) {
      review.adminNotes = String(payload.adminNotes || "").trim();
    }

    await review.save();
    await refreshSpaceReviewStats(review.space);

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  createReview,
  getPendingReviewPrompts,
  getReviewById,
  getSpaceReviews,
  getUserReviews,
  getAdminReviews,
  getAdminReviewSummary,
  getReviewInsightsForSpaceIds,
  updateReview,
  deleteReview,
  addResponse,
  markHelpful,
  flagReview,
  togglePublish,
  moderateReview,
};
