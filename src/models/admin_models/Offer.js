import mongoose from "mongoose";

const { Schema } = mongoose;

const offerSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    code: {
      type: String,
      uppercase: true,
      trim: true,
      unique: true,
      sparse: true,
    },

    title: { type: String, required: true },
    description: { type: String, default: "" },

    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      required: true,
    },

    discountValue: { type: Number, required: true, min: 0 },

    minBookingAmount: { type: Number, default: 0 },

    maxDiscountAmount: { type: Number, default: null },

    validFrom: { type: Date, required: true },
    validTill: { type: Date, required: true },

    applicablePlanTypes: {
      type: [String],
      enum: ["hourly", "daily", "weekly", "monthly"],
      default: undefined,
    },

    firstTimeUserOnly: { type: Boolean, default: false },

    perUserUsageLimit: { type: Number, default: 1 },

    totalUsageLimit: { type: Number, default: null },

    usedCount: { type: Number, default: 0 },

    stackable: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

offerSchema.index({ space: 1, isActive: 1 });
offerSchema.index({ code: 1 });
offerSchema.index({ validFrom: 1, validTill: 1 });

export default mongoose.model("Offer", offerSchema);
