import mongoose from "mongoose";

const { Schema } = mongoose;

const PLAN_TYPES = ["daily", "weekly", "monthly"];

const planResourceSchema = new Schema(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    credits: {
      type: Number,
      default: 1,
      min: 1,
    },
    labelSnapshot: {
      type: String,
      default: "",
    },
    typeSnapshot: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);

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
      enum: PLAN_TYPES,
      required: true,
    },

    title: { type: String, required: true },

    price: { type: Number, required: true, min: 0 },

    gstPercentage: { type: Number, default: 18 },

    currency: { type: String, default: "INR" },

    inclusions: { type: [String], default: [] },

    assignedResources: {
      type: [planResourceSchema],
      default: [],
    },

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
pricingPlanSchema.index({ space: 1, type: 1, isActive: 1 });

export default mongoose.model("PricingPlan", pricingPlanSchema);
