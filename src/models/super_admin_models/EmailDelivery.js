import mongoose from "mongoose";

const { Schema } = mongoose;

const emailDeliverySchema = new Schema(
  {
    campaign: {
      type: Schema.Types.ObjectId,
      ref: "EmailCampaign",
      required: true,
      index: true,
    },
    recipientUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    recipientName: { type: String, trim: true, default: "" },
    trackingToken: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "opened", "clicked", "failed", "unsubscribed"],
      default: "queued",
      index: true,
    },
    variables: { type: Schema.Types.Mixed, default: {} },
    error: { type: String, trim: true, default: "" },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    clickedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailDeliverySchema.index({ campaign: 1, email: 1 }, { unique: true });
emailDeliverySchema.index({ campaign: 1, status: 1 });

export default
  mongoose.models.EmailDelivery ||
  mongoose.model("EmailDelivery", emailDeliverySchema);
