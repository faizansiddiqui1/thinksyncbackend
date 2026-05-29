import mongoose from "mongoose";

const { Schema } = mongoose;

const consultantEditRequestSchema = new Schema(
  {
    consultant: {
      type: Schema.Types.ObjectId,
      ref: "Consultant",
      required: true,
      index: true,
    },

    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    changes: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    reviewNotes: {
      type: String,
      trim: true,
      default: "",
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

consultantEditRequestSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model(
  "ConsultantEditRequest",
  consultantEditRequestSchema,
);
