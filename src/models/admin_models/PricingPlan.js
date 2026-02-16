import mongoose from "mongoose";

const { Schema } = mongoose;

const pricingPlanSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    }, 

    type: {
      type: String,
      enum: ["hourly", "daily", "monthly"],
      required: true,
    },

    title: { type: String, required: true },

    price: { type: Number, required: true, min: 0 },

    gstPercentage: { type: Number, default: 18 },

    currency: { type: String, default: "INR" },

    inclusions: { type: [String], default: [] },

    popular: { type: Boolean, default: false },

    order: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

pricingPlanSchema.index({ space: 1, order: 1 });
pricingPlanSchema.index({ space: 1, popular: -1 });

export default mongoose.model("PricingPlan", pricingPlanSchema);
