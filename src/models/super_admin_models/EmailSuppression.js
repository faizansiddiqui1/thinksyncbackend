import mongoose from "mongoose";

const { Schema } = mongoose;

const emailSuppressionSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["unsubscribed", "bounce", "complaint", "manual"],
      default: "unsubscribed",
    },
    sourceCampaign: {
      type: Schema.Types.ObjectId,
      ref: "EmailCampaign",
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export default
  mongoose.models.EmailSuppression ||
  mongoose.model("EmailSuppression", emailSuppressionSchema);
