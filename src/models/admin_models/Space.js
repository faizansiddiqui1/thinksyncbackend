import mongoose from "mongoose";
import slugify from "slugify";

const { Schema } = mongoose;

/* =========================
   ADDRESS
========================= */
const addressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: { type: [Number] },
    },

    nearbyLandmarks: { type: [String], default: [] },
    timezone: { type: String, default: "Asia/Kolkata" },
  },
  { _id: false },
);

/* =========================
   AMENITY
========================= */
const amenitySchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, default: "other" },
    available: { type: Boolean, default: true },
    description: { type: String, default: "" },
  },
  { _id: false },
);

/* =========================
   LISTING PRICES (NEW)
========================= */
const listingPricesSchema = new Schema(
  {
    show: {
      hourly: { type: Boolean, default: false },
      daily: { type: Boolean, default: false },
      weekly: { type: Boolean, default: false },
      monthly: { type: Boolean, default: false },
    },
    hourly: { type: Number, min: 0, default: null },
    daily: { type: Number, min: 0, default: null },
    weekly: { type: Number, min: 0, default: null },
    monthly: { type: Number, min: 0, default: null },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR"],
      default: "INR",
    },
  },
  { _id: false },
);

/* =========================
   OPERATING HOURS
========================= */
const operatingHoursSchema = new Schema(
  {
    day: {
      type: String,
      enum: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      required: true,
    },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: "09:00" },
    closeTime: { type: String, default: "18:00" },
  },
  { _id: false },
);

/* =========================
   CONTACT / WIFI / PARKING / ETC
========================= */
const contactSchema = new Schema(
  {
    phone: { type: String },
    email: { type: String },
    whatsapp: String,
    managerName: String,
    managerPhone: String,
    managerEmail: String,
  },
  { _id: false },
);

const wifiSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    speed: String,
    isPaid: { type: Boolean, default: false },
  },
  { _id: false },
);

const parkingSchema = new Schema(
  {
    available: { type: Boolean, default: true },
    type: [{ type: String, enum: ["car", "bike", "bicycle"] }],
    isPaid: { type: Boolean, default: false },
    capacity: Number,
  },
  { _id: false },
);

const transportSchema = new Schema(
  {
    nearestMetro: String,
    metroDistance: Number,
    nearestBusStop: String,
    busDistance: Number,
    nearestRailway: String,
    railwayDistance: Number,
  },
  { _id: false },
);

const billingSchema = new Schema(
  {
    gstNumber: String,
    paymentMethods: [
      { type: String, enum: ["cash", "card", "upi", "netbanking", "wallet"] },
    ],
    bankDetails: {
      accountName: String,
      accountNumber: String,
      ifscCode: String,
      bankName: String,
    },
  },
  { _id: false },
);

/* =========================
   SPACE
========================= */
const spaceSchema = new Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, lowercase: true },

    shortDescription: { type: String, required: true, maxlength: 200 },
    longDescription: { type: String, required: true },
    tagline: { type: String, maxlength: 100 },

    searchKeywords: [String],

    // calculated automatically
    startingPrice: Number,

    spaceType: {
      type: String,
      enum: [
        "private_office",
        "managed_office",
        "virtual_office",
        "event_space",
      ], 
      required: true,
    },

    // inventory: {
    //   total: { type: Number, default: 0 }, // total offices
    //   available: { type: Number, default: 0 }, // available now
    //   booked: { type: Number, default: 0 }, // already booked
    //   startDateTime: Date,
    //   endDateTime: Date,
    // },

    bookingRules: {
      supportsHourly: { type: Boolean, default: true },
      supportsDaily: { type: Boolean, default: true },
      supportsWeekly: { type: Boolean, default: true },
      supportsMonthly: { type: Boolean, default: true },
      bufferMinutes: { type: Number, default: 0 },
    },
    blackoutDates: [
      {
        startDateTime: Date,
        endDateTime: Date,
        reason: String,
      },
    ],
    // NEW listing level prices
    listingPrices: { type: listingPricesSchema, default: () => ({}) },

    capacity: {
      min: { type: Number, required: true, min: 1 },
      max: {
        type: Number,
        required: true,
        validate: {
          validator: function (v) {
            return v >= this.capacity.min;
          },
          message: "Max capacity must be >= min capacity",
        },
      },
    },

    totalArea: { type: Number, required: true },
    floorNumber: { type: Number, required: true },

    access24x7: { type: Boolean, default: false },
    operatingHours: [operatingHoursSchema],

    highlights: [String],
    houseRules: [String],

    wifi: wifiSchema,
    powerBackup: { type: Boolean, default: false },
    parking: parkingSchema,
    transport: transportSchema,

    address: { type: addressSchema, required: true },

    amenities: [amenitySchema],

    contact: contactSchema,
    billing: billingSchema,

    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    analytics: {
      views: { type: Number, default: 0 },
      favorites: { type: Number, default: 0 },
      bookings: { type: Number, default: 0 },
    },

    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },

    tags: [String],
    categories: [String],

    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "DRAFT",
    },

    adminNotes: String,
    internalFlags: {
      verified: { type: Boolean, default: false },
      premium: { type: Boolean, default: false },
      trending: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/* =========================
   HOOKS
========================= */
spaceSchema.pre("validate", function (next) {
  if (this.isNew && !this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  const prices = [];

  // fallback to listing-level price
  if (this.listingPrices) {
    ["hourly", "daily", "weekly", "monthly"].forEach((k) => {
      const v = this.listingPrices[k];
      if (typeof v === "number" && v >= 0) prices.push(v);
    });  
  }

  if (prices.length) {
    this.startingPrice = Math.min(...prices);
  }

  next();
});

/* =========================
   INDEXES
========================= */
spaceSchema.index({ slug: 1 });
spaceSchema.index({ spaceType: 1, "address.city": 1 });
spaceSchema.index({ "address.city": 1 });
spaceSchema.index({ "address.location": "2dsphere" });
spaceSchema.index({ averageRating: -1 });
spaceSchema.index({ isPublished: 1, isFeatured: -1 });
spaceSchema.index({ createdAt: -1 });

/* =========================
   VIRTUALS
========================= */
spaceSchema.virtual("media", {
  ref: "SpaceMedia",
  localField: "_id",
  foreignField: "space",
  justOne: true,
});

spaceSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "space",
});

spaceSchema.virtual("resources", {
  ref: "Resource",
  localField: "_id",
  foreignField: "space",
});

spaceSchema.virtual("pricingPlans", {
  ref: "PricingPlan",
  localField: "_id",
  foreignField: "space",
});

spaceSchema.virtual("offers", {
  ref: "Offer",
  localField: "_id",
  foreignField: "space",
});

export default mongoose.model("Space", spaceSchema);
