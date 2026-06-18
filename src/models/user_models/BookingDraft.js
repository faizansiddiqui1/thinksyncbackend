import mongoose from "mongoose";

const { Schema } = mongoose;

const draftOwnerSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    guestToken: {
      type: String,
      default: null,
      index: true,
    },
  },
  { _id: false },
);

const draftSpaceSchema = new Schema(
  {
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },
    slug: { type: String, default: "" },
    name: { type: String, default: "" },
    spaceType: { type: String, default: "" },
  },
  { _id: false },
);

const draftSelectionSchema = new Schema(
  {
    bookingType: { type: String, default: "daily" },
    durationCount: { type: Number, default: 1 },
    timezone: { type: String, default: "Asia/Kolkata" },
    startDateTime: { type: Date, default: null },
    endDateTime: { type: Date, default: null },
    selectedDateKeys: { type: [String], default: [] },
    selectedSlots: { type: [Schema.Types.Mixed], default: [] },
    bookingSegments: { type: [Schema.Types.Mixed], default: [] },
    chargeLines: { type: [Schema.Types.Mixed], default: [] },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "PricingPlan",
      default: null,
    },
    purchaseIntent: {
      type: String,
      enum: ["BOOKING", "PLAN_MEMBERSHIP"],
      default: "BOOKING",
    },
    primaryItem: {
      type: Schema.Types.Mixed,
      default: null,
    },
    sourceCartDraftIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
  },
  { _id: false },
);

const draftResourceSchema = new Schema(
  {
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    name: { type: String, default: "" },
    type: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    unitPriceSnapshot: { type: Number, default: 0, min: 0 },
    bookingType: { type: String, default: "" },
    bundleId: { type: String, default: "" },
  },
  { _id: false },
);

const draftAddonSchema = new Schema(
  {
    addonId: {
      type: Schema.Types.ObjectId,
      ref: "Addon",
      required: true,
    },
    name: { type: String, default: "" },
    type: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    unitPriceSnapshot: { type: Number, default: 0, min: 0 },
    bookingType: { type: String, default: "" },
    bundleId: { type: String, default: "" },
  },
  { _id: false },
);

const draftPricingSchema = new Schema(
  {
    basePrice: { type: Number, default: 0 },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    couponStatus: {
      type: String,
      enum: ["none", "applied", "invalid"],
      default: "none",
    },
    lineItems: { type: [Schema.Types.Mixed], default: [] },
    currency: { type: String, default: "INR" },
  },
  { _id: false },
);

const draftValidationSchema = new Schema(
  {
    state: {
      type: String,
      enum: ["valid", "invalid", "incomplete"],
      default: "incomplete",
      index: true,
    },
    issues: { type: [Schema.Types.Mixed], default: [] },
    validatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const draftCheckoutSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
    gateway: { type: String, default: "" },
    paymentStatus: { type: String, default: "pending" },
    paymentMethod: { type: String, default: "upi" },
    lastPreparedAt: { type: Date, default: null },
  },
  { _id: false },
);

const draftCartLifecycleSchema = new Schema(
  {
    state: {
      type: String,
      enum: ["ACTIVE", "UNAVAILABLE", "EXPIRED", "REMOVED", "CHECKOUT_COMPLETED"],
      default: "ACTIVE",
      index: true,
    },
    reason: { type: String, default: "" },
    message: { type: String, default: "" },
    checkedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const bookingDraftSchema = new Schema(
  {
    owner: {
      type: draftOwnerSchema,
      required: true,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: ["active", "completed", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    draftStage: {
      type: String,
      enum: ["cart", "availability", "checkout", "completed", "cancelled"],
      default: "checkout",
      index: true,
    },
    space: {
      type: draftSpaceSchema,
      required: true,
    },
    selection: {
      type: draftSelectionSchema,
      default: () => ({}),
    },
    resources: {
      type: [draftResourceSchema],
      default: [],
    },
    addons: {
      type: [draftAddonSchema],
      default: [],
    },
    pricingSummary: {
      type: draftPricingSchema,
      default: () => ({}),
    },
    specialRequests: {
      type: String,
      default: "",
    },
    validation: {
      type: draftValidationSchema,
      default: () => ({}),
    },
    checkout: {
      type: draftCheckoutSchema,
      default: () => ({}),
    },
    cartLifecycle: {
      type: draftCartLifecycleSchema,
      default: () => ({}),
    },
    version: {
      type: Number,
      default: 0,
      index: true,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      default: "",
    },
    sourceRoute: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

bookingDraftSchema.index({ "owner.userId": 1, status: 1, lastActivityAt: -1 });
bookingDraftSchema.index({ "owner.guestToken": 1, status: 1, lastActivityAt: -1 });
bookingDraftSchema.index({ "owner.userId": 1, draftStage: 1, status: 1, lastActivityAt: -1 });
bookingDraftSchema.index({ "owner.guestToken": 1, draftStage: 1, status: 1, lastActivityAt: -1 });
bookingDraftSchema.index({ status: 1, expiresAt: 1 });
bookingDraftSchema.index({ "cartLifecycle.state": 1, updatedAt: 1 });

export default mongoose.model("BookingDraft", bookingDraftSchema);
