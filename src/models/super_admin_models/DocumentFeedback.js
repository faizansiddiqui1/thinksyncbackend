import mongoose from "mongoose";

const { Schema } = mongoose;

const documentFeedbackSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },
    slug: { type: String, trim: true, lowercase: true, index: true },
    helpful: { type: Boolean, required: true, index: true },
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, trim: true, default: "", maxlength: 2000 },
    email: { type: String, trim: true, lowercase: true, default: "" },
    path: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, default: "" },
    ipAddress: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentFeedbackSchema.index({ createdAt: -1 });

export default mongoose.models.DocumentFeedback ||
  mongoose.model("DocumentFeedback", documentFeedbackSchema);
