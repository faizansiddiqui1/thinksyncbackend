import mongoose from "mongoose";

const { Schema } = mongoose;

const creditSchema = new Schema(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    resourceName: { type: String, default: "" },
    resourceType: { type: String, default: "" },
    total: { type: Number, default: 1, min: 1 },
    used: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const planPurchaseSchema = new Schema(
  {
    user: {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },
    plan: {
      planId: { type: Schema.Types.ObjectId, ref: "PricingPlan", required: true },
      title: { type: String, required: true },
      type: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        required: true,
      },
      price: { type: Number, default: 0, min: 0 },
      gstPercentage: { type: Number, default: 18 },
      currency: { type: String, default: "INR" },
    },
    validity: {
      startDate: { type: Date, required: true, index: true },
      endDate: { type: Date, required: true, index: true },
    },
    credits: {
      type: [creditSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "upcoming", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    payment: {
      status: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "paid",
      },
      method: { type: String, default: "internal" },
      reference: { type: String, default: "" },
      paidAt: { type: Date, default: Date.now },
    },
    priceBreakdown: {
      basePrice: { type: Number, default: 0 },
      gstPercentage: { type: Number, default: 18 },
      gstAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

planPurchaseSchema.index({ "user.userId": 1, "validity.startDate": -1 });
planPurchaseSchema.index({ space: 1, "plan.planId": 1, createdAt: -1 });

export default mongoose.models.PlanPurchase ||
  mongoose.model("PlanPurchase", planPurchaseSchema);
