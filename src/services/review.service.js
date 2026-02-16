import Review from '../models/Review.js';
import Space from '../models/Space.js';
import Booking from '../models/Booking.js';

/* =========================
   Create Review
========================= */
export const createReview = async (reviewData) => {
  try {
    const { space, user, booking } = reviewData;

    const spaceExists = await Space.findById(space);
    if (!spaceExists) {
      return { success: false, error: 'Space not found' };
    }

    if (booking) {
      const bookingExists = await Booking.findOne({
        _id: booking,
        'user.userId': user.userId,
        status: 'completed'
      });

      if (bookingExists) {
        reviewData.verifiedBooking = true;
      }

      const existingReview = await Review.findOne({ booking });
      if (existingReview) {
        return {
          success: false,
          error: 'Review already exists for this booking'
        };
      }
    }

    const review = new Review(reviewData);
    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get Review By ID
========================= */
export const getReviewById = async (id) => {
  try {
    const review = await Review.findById(id)
      .populate('space', 'name slug')
      .populate('user.userId', 'name avatar');

    if (!review) {
      return { success: false, error: 'Review not found' };
    }

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get Space Reviews
========================= */
export const getSpaceReviews = async (spaceId, filters = {}) => {
  try {
    const {
      rating,
      verifiedOnly,
      page = 1,
      limit = 20,
      sortBy = 'createdAt'
    } = filters;

    const query = { space: spaceId, isPublished: true };

    if (rating) query.rating = rating;
    if (verifiedOnly) query.verifiedBooking = true;

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: -1 };

    const reviews = await Review.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Review.countDocuments(query);

    const ratingDistribution = await Review.aggregate([
      { $match: { space: spaceId, isPublished: true } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    return {
      success: true,
      data: {
        reviews,
        ratingDistribution,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Get User Reviews
========================= */
export const getUserReviews = async (userId, filters = {}) => {
  try {
    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ 'user.userId': userId })
      .populate('space', 'name slug images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ 'user.userId': userId });

    return {
      success: true,
      data: {
        reviews,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Update Review
========================= */
export const updateReview = async (id, userId, updateData) => {
  try {
    const review = await Review.findOne({
      _id: id,
      'user.userId': userId
    });

    if (!review) {
      return {
        success: false,
        error: 'Review not found or unauthorized'
      };
    }

    Object.assign(review, updateData);
    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Delete Review
========================= */
export const deleteReview = async (id, userId, isAdmin = false) => {
  try {
    const query = { _id: id };
    if (!isAdmin) {
      query['user.userId'] = userId;
    }

    const review = await Review.findOneAndDelete(query);
    if (!review) {
      return {
        success: false,
        error: 'Review not found or unauthorized'
      };
    }

    const reviews = await Review.find({
      space: review.space,
      isPublished: true
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    await Space.findByIdAndUpdate(review.space, {
      averageRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length
    });

    return {
      success: true,
      message: 'Review deleted successfully'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Add Response
========================= */
export const addResponse = async (id, responseData) => {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: 'Review not found' };
    }

    review.response = {
      ...responseData,
      respondedAt: new Date()
    };

    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Mark Helpful
========================= */
export const markHelpful = async (id, userId) => {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: 'Review not found' };
    }

    const hasMarked = review.helpful.users.includes(userId);

    if (hasMarked) {
      review.helpful.users = review.helpful.users.filter(
        u => u.toString() !== userId.toString()
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
};

/* =========================
   Flag Review
========================= */
export const flagReview = async (id, reason) => {
  try {
    const review = await Review.findByIdAndUpdate(
      id,
      { isFlagged: true, adminNotes: reason },
      { new: true }
    );

    if (!review) {
      return { success: false, error: 'Review not found' };
    }

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/* =========================
   Toggle Publish
========================= */
export const togglePublish = async (id) => {
  try {
    const review = await Review.findById(id);
    if (!review) {
      return { success: false, error: 'Review not found' };
    }

    review.isPublished = !review.isPublished;
    await review.save();

    return { success: true, data: review };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
