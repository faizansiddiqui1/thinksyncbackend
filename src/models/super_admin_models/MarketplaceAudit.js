import mongoose from "mongoose";

const marketplaceAuditSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      required: true,
      enum: ["space", "white_label"],
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
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
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
    updatedAt: false,
  },
);

marketplaceAuditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
marketplaceAuditSchema.index({ createdAt: -1 });

export default mongoose.model("MarketplaceAudit", marketplaceAuditSchema);
