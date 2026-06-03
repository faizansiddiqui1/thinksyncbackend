import mongoose from "mongoose";

const { Schema } = mongoose;

const MASTER_PLAN_TYPES = ["daily", "weekly", "monthly"];

const masterPlanTemplateSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: MASTER_PLAN_TYPES,
      required: true,
      index: true,
    },
    description: { type: String, default: "" },
    suggestedPrice: { type: Number, default: 0, min: 0 },
    gstPercentage: { type: Number, default: 18, min: 0 },
    currency: { type: String, default: "INR" },
    inclusions: { type: [String], default: [] },
    resourceTypes: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

masterPlanTemplateSchema.index({ type: 1, order: 1 });
masterPlanTemplateSchema.index({ isActive: 1, order: 1 });

export default mongoose.models.MasterPlanTemplate ||
  mongoose.model("MasterPlanTemplate", masterPlanTemplateSchema);
