import mongoose from "mongoose";

const { Schema } = mongoose;

const compareSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    listingIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Space",
        required: true,
      },
    ],
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

compareSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.CompareSession ||
  mongoose.model("CompareSession", compareSessionSchema);

