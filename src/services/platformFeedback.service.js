import VisitorFeedback from "../models/user_models/VisitorFeedback.js";

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

function buildPlatformFeedbackMatch(filters = {}) {
  const query = {};

  if (filters.issueType && filters.issueType !== "all") {
    query.issueType = String(filters.issueType);
  }

  if (filters.source && filters.source !== "all") {
    query.source = String(filters.source);
  }

  if (filters.deviceType && filters.deviceType !== "all") {
    query.deviceType = String(filters.deviceType);
  }

  if (filters.resolved === true) {
    query.resolved = true;
  }

  if (filters.resolved === false) {
    query.resolved = false;
  }

  if (filters.guestStatus === "guest") {
    query.user = null;
  }

  if (filters.guestStatus === "logged_in") {
    query.user = { $ne: null };
  }

  const startDate = normalizeDate(filters.startDate);
  const endDate = normalizeDate(filters.endDate, { endOfDay: true });
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  const search = String(filters.search || "").trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    query.$or = [
      { feedbackMessage: regex },
      { currentPage: regex },
      { sessionId: regex },
      { issueType: regex },
      { deviceType: regex },
    ];
  }

  return query;
}

export async function getPlatformFeedbackList(filters = {}) {
  try {
    const page = normalizePositiveInt(filters.page, 1);
    const limit = Math.min(normalizePositiveInt(filters.limit, 15), 100);
    const skip = (page - 1) * limit;
    const query = buildPlatformFeedbackMatch(filters);

    const [items, total] = await Promise.all([
      VisitorFeedback.find(query)
        .populate("user", "username name email")
        .populate({
          path: "booking",
          select: "startDateTime endDateTime status paymentStatus payment.status space",
          populate: {
            path: "space",
            select: "name slug spaceType",
          },
        })
        .populate("resolvedBy", "username name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VisitorFeedback.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        items: items.map((item) => ({
          _id: item._id,
          source: item.source,
          issueType: item.issueType,
          feedbackMessage: item.feedbackMessage,
          currentPage: item.currentPage,
          deviceType: item.deviceType,
          sessionId: item.sessionId,
          easeRating: item.easeRating,
          resolved: !!item.resolved,
          resolvedAt: item.resolvedAt,
          resolvedBy: item.resolvedBy
            ? {
                _id: item.resolvedBy._id,
                username:
                  item.resolvedBy.username ||
                  item.resolvedBy.name ||
                  item.resolvedBy.email ||
                  "Admin",
                email: item.resolvedBy.email || "",
              }
            : null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          user: item.user
            ? {
                _id: item.user._id,
                username:
                  item.user.username ||
                  item.user.name ||
                  item.user.email ||
                  "Logged-in user",
                email: item.user.email || "",
              }
            : null,
          actorType: item.user ? "logged_in" : "guest",
          booking: item.booking
            ? {
                _id: item.booking._id,
                startDateTime: item.booking.startDateTime,
                endDateTime: item.booking.endDateTime,
                status: item.booking.status,
                paymentStatus:
                  item.booking.paymentStatus || item.booking.payment?.status || "",
                workspace: item.booking.space
                  ? {
                      _id: item.booking.space._id,
                      name: item.booking.space.name,
                      slug: item.booking.space.slug,
                      spaceType: item.booking.space.spaceType || "workspace",
                    }
                  : null,
              }
            : null,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getPlatformFeedbackSummary(filters = {}) {
  try {
    const query = buildPlatformFeedbackMatch(filters);
    const [summary] = await VisitorFeedback.aggregate([
      { $match: query },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalFeedback: { $sum: 1 },
                resolvedCount: {
                  $sum: {
                    $cond: [{ $eq: ["$resolved", true] }, 1, 0],
                  },
                },
                unresolvedCount: {
                  $sum: {
                    $cond: [{ $eq: ["$resolved", false] }, 1, 0],
                  },
                },
                guestCount: {
                  $sum: {
                    $cond: [{ $eq: ["$user", null] }, 1, 0],
                  },
                },
                loggedInCount: {
                  $sum: {
                    $cond: [{ $ne: ["$user", null] }, 1, 0],
                  },
                },
              },
            },
          ],
          issueBreakdown: [
            {
              $group: {
                _id: "$issueType",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, _id: 1 } },
          ],
          sourceBreakdown: [
            {
              $group: {
                _id: "$source",
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          deviceBreakdown: [
            {
              $group: {
                _id: "$deviceType",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, _id: 1 } },
          ],
        },
      },
    ]);

    const overview = summary?.overview?.[0] || {};

    return {
      success: true,
      data: {
        totalFeedback: Number(overview.totalFeedback || 0),
        resolvedCount: Number(overview.resolvedCount || 0),
        unresolvedCount: Number(overview.unresolvedCount || 0),
        guestCount: Number(overview.guestCount || 0),
        loggedInCount: Number(overview.loggedInCount || 0),
        issueBreakdown: summary?.issueBreakdown || [],
        sourceBreakdown: summary?.sourceBreakdown || [],
        deviceBreakdown: summary?.deviceBreakdown || [],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function updatePlatformFeedbackStatus(
  id,
  { resolved, actorId } = {},
) {
  try {
    const doc = await VisitorFeedback.findByIdAndUpdate(
      id,
      {
        $set: {
          resolved: !!resolved,
          resolvedAt: resolved ? new Date() : null,
          resolvedBy: resolved ? actorId || null : null,
        },
      },
      { new: true },
    )
      .populate("user", "username name email")
      .populate("resolvedBy", "username name email")
      .lean();

    if (!doc) {
      return {
        success: false,
        error: "Feedback not found",
      };
    }

    return {
      success: true,
      data: doc,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
