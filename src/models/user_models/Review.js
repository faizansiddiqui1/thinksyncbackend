import mongoose from "mongoose";

const { Schema } = mongoose;

const responseSchema = new Schema(
  {
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1500,
    },

    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const helpfulSchema = new Schema(
  {
    count: {
      type: Number,
      default: 0,
      min: 0,
    },

    users: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
  },
  { _id: false },
);

const reviewSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },

    verifiedBooking: {
      type: Boolean,
      default: false,
    },

    isApproved: {
      type: Boolean,
      default: true,
    },

    isPublished: {
      type: Boolean,
      default: true,
    },

    isFlagged: {
      type: Boolean,
      default: false,
    },

    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },

    response: {
      type: responseSchema,
      default: () => ({}),
    },

    helpful: {
      type: helpfulSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

reviewSchema.index({ space: 1, createdAt: -1 });
reviewSchema.index(
  { booking: 1 },
  {
    unique: true,
    partialFilterExpression: {
      booking: { $type: "objectId" },
    },
  },
);

export default mongoose.model("Review", reviewSchema);
