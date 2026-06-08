import mongoose from "mongoose";

const { Schema } = mongoose;

const emailCampaignSchema = new Schema(
  {
    name: { type: String, trim: true, default: "" },
    template: {
      type: Schema.Types.ObjectId,
      ref: "EmailTemplate",
      default: null,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdByRole: { type: String, trim: true, default: "" },
    audienceType: {
      type: String,
      enum: ["selected", "filtered", "all", "manual", "mixed"],
      default: "selected",
      index: true,
    },
    filters: { type: Schema.Types.Mixed, default: {} },
    subject: { type: String, trim: true, required: true },
    html: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "completed_with_errors", "failed"],
      default: "queued",
      index: true,
    },
    totals: {
      recipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailCampaignSchema.index({ createdBy: 1, createdAt: -1 });
emailCampaignSchema.index({ status: 1, createdAt: -1 });

export default
  mongoose.models.EmailCampaign ||
  mongoose.model("EmailCampaign", emailCampaignSchema);
