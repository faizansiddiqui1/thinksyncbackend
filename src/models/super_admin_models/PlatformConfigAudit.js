import mongoose from "mongoose";

const platformConfigAuditSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: ["upsert", "toggle", "reset"],
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      default: "",
      trim: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    nextState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    updatedAt: false,
  },
);

platformConfigAuditSchema.index({ createdAt: -1 });

export default mongoose.model("PlatformConfigAudit", platformConfigAuditSchema);
