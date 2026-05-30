import mongoose from "mongoose";

const { Schema } = mongoose;

const eventPricingSchema = new Schema(
  {
    hourly: { type: Number, min: 0, default: null },
    halfDay: { type: Number, min: 0, default: null },
    fullDay: { type: Number, min: 0, default: null },
    daily: { type: Number, min: 0, default: null },
    currency: { type: String, default: "INR", trim: true },
    minimumHours: { type: Number, min: 0, default: null },
    isNegotiable: { type: Boolean, default: true },
  },
  { _id: false },
);

const eventCapacitySchema = new Schema(
  {
    min: { type: Number, min: 1, default: 1 },
    max: { type: Number, min: 1, default: 1 },
    seated: { type: Number, min: 0, default: null },
    standing: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

const foodAndBeverageSchema = new Schema(
  {
    allowed: { type: Boolean, default: true },
    inHouseCatering: { type: Boolean, default: false },
    externalCatering: { type: Boolean, default: true },
    alcoholAllowed: { type: Boolean, default: false },
  },
  { _id: false },
);

const eventBookingRulesSchema = new Schema(
  {
    advanceNoticeHours: { type: Number, min: 0, default: 24 },
    cancellationPolicy: { type: String, trim: true, default: "" },
    overtimeAllowed: { type: Boolean, default: true },
    setupTimeMinutes: { type: Number, min: 0, default: 0 },
    cleanupTimeMinutes: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const EventSpaceSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      unique: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
      default: "",
    },

    eventTypes: {
      type: [String],
      default: [],
    },

    layoutOptions: {
      type: [String],
      default: [],
    },

    capacity: {
      type: eventCapacitySchema,
      default: () => ({}),
    },

    areaSqFt: {
      type: Number,
      min: 0,
      default: null,
    },

    pricing: {
      type: eventPricingSchema,
      default: () => ({}),
    },

    availabilityStatus: {
      type: String,
      enum: ["available", "limited", "unavailable", "on_request"],
      default: "available",
      index: true,
    },

    amenities: {
      type: [String],
      default: [],
    },

    equipment: {
      type: [String],
      default: [],
    },

    inclusions: {
      type: [String],
      default: [],
    },

    addOns: {
      type: [String],
      default: [],
    },

    foodAndBeverage: {
      type: foodAndBeverageSchema,
      default: () => ({}),
    },

    bookingRules: {
      type: eventBookingRulesSchema,
      default: () => ({}),
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

EventSpaceSchema.index({ space: 1, isActive: 1 });
EventSpaceSchema.index({ availabilityStatus: 1, isActive: 1 });
EventSpaceSchema.index({ eventTypes: 1 });

export default mongoose.model("EventSpace", EventSpaceSchema);
