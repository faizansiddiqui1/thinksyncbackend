import mongoose from "mongoose";

const { Schema } = mongoose;

const visitRequestSchema = new Schema(
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
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    visitType: {
      type: String,
      enum: ["guided_tour", "space_visit", "sales_call"],
      default: "guided_tour",
    },
    preferredDate: {
      type: Date,
      required: true,
      index: true,
    },
    preferredTime: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "contacted", "scheduled", "completed", "cancelled"],
      default: "new",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    whatsappUpdates: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

visitRequestSchema.index({ createdAt: -1 });
visitRequestSchema.index({ ownerId: 1, createdAt: -1 });

export default mongoose.models.VisitRequest ||
  mongoose.model("VisitRequest", visitRequestSchema);

