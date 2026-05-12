import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    space: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    review: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    categories: {
      cleanliness: { type: Number, min: 1, max: 5 },
      internet: { type: Number, min: 1, max: 5 },
      staff: { type: Number, min: 1, max: 5 },
      ambience: { type: Number, min: 1, max: 5 },
      accessibility: { type: Number, min: 1, max: 5 },
      valueForMoney: { type: Number, min: 1, max: 5 },
    },

    images: {
      type: [String],
      default: [],
    },

    isVerifiedReview: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },

    helpfulCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One review per user per space
reviewSchema.index({ space: 1, user: 1 }, { unique: true });
reviewSchema.index({ space: 1, createdAt: -1 });

reviewSchema.statics.recalculateSpaceRating = async function (spaceId) {
  const stats = await this.aggregate([
    {
      $match: {
        space: new mongoose.Types.ObjectId(spaceId),
        status: "approved",
      },
    },
    {
      $group: {
        _id: "$space",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const update = {
    averageRating: 0,
    reviewCount: 0,
  };

  if (stats.length > 0) {
    update.averageRating = Number((stats[0].averageRating || 0).toFixed(1));
    update.reviewCount = stats[0].reviewCount || 0;
  }

  await mongoose.model("Space").findByIdAndUpdate(spaceId, update, {
    runValidators: false,
  });

  return update;
};

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);
export default Review;