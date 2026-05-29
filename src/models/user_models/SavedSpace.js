import mongoose from "mongoose";

const { Schema } = mongoose;

const savedSpaceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    listingId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

savedSpaceSchema.index({ userId: 1, listingId: 1 }, { unique: true });
savedSpaceSchema.index({ createdAt: -1 });

export default mongoose.models.SavedSpace ||
  mongoose.model("SavedSpace", savedSpaceSchema);

