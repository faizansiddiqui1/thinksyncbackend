import mongoose from "mongoose";
import slugify from "slugify";

const { Schema } = mongoose;

/* =========================
   ADDRESS
========================= */
const addressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true },
    locality: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    city: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
      index: true,
    },
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
    key: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    label: {
      type: String,
      required: true,
      trim: true,
    },

    // category/type
    type: {
      type: String,
      enum: [
        "workspace",
        "facility",
        "food",
        "transport",
        "security",
        "comfort",
        "other",
      ],
      default: "other",
    },

    // available or not
    available: {
      type: Boolean,
      default: true,
    },

    // free / paid
    pricing: {
      type: String,
      enum: ["free", "paid"],
      default: "free",
    },

    // premium amenity
    isPremium: {
      type: Boolean,
      default: false,
    },

    // show on card highlights
    isHighlighted: {
      type: Boolean,
      default: false,
    },

    // optional short text
    description: {
      type: String,
      default: "",
    },

    // sorting priority
    priority: {
      type: Number,
      default: 0,
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
    nearestAirport: String,
    airportDistance: String,
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

    shortDescription: { type: String, maxlength: 200 },
    longDescription: { type: String, required: true },
    tagline: { type: String, maxlength: 100 },

    searchKeywords: [String],

    // denormalized / optional, can be used for sorting/filtering cards
    startingPrice: { type: Number, default: null },

    spaceType: {
      type: String,
      enum: [
        "coworking_space",
        "cowork_space", // legacy alias
        "private_office",
        "managed_office",
        "virtual_office",
        "vertual_office", // legacy alias
        "event_space",
      ],
      required: true,
      index: true,
    },

    // controls what flows this space supports in the admin / frontend
    listingModes: {
      shortTerm: { type: Boolean, default: true },
      longTerm: { type: Boolean, default: false },
    },

    privateOfficeDetails: {
      floorSize: Number,
      floorConfiguration: String,
      buildingGrade: {
        type: String,
        enum: ["A", "B", "C"],
      },
      lockInPeriodMonths: Number,
      securityDepositMonths: Number,
      noticePeriodMonths: Number,
      furnishing: {
        type: String,
        enum: ["furnished", "semi_furnished", "unfurnished"],
      },
      possessionStatus: {
        type: String,
        enum: ["ready", "under_construction"],
      },
      availabilityStatus: {
        type: String,
        enum: ["available", "occupied", "reserved"],
        default: "available",
      },
    },

    // myHQ-style center summary; keep this as the source of truth
    centerDetails: {
      totalCenterArea: {
        type: Number,
        default: null,
      },

      totalSeats: {
        type: Number,
        default: null,
      },

      totalBuildingFloors: {
        type: Number,
        default: null,
      },

      usedFloors: {
        type: [String],
        default: [],
      },

      typicalFloorplateArea: {
        type: Number,
        default: null,
      },
    },

    // keep for private-office / enterprise pricing only
    priceBreakup: {
      rentPerSqFt: Number,
      maintenancePerSqFt: Number,
      totalPerSqFt: Number,

      currency: { type: String, default: "INR" },
      isNegotiable: { type: Boolean, default: true },
      excludesTaxes: { type: Boolean, default: true },
    },

    buildingInfo: {
      name: String,
      totalFloors: Number,
      yearBuilt: Number,
      developer: String,
    },

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

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    adminNotes: String,

    approvalReviewedAt: Date,
    approvalReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    operationalStatus: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },

    suspendedAt: Date,
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

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
  if (this.isNew && !this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }

  next();
});

/* =========================
   INDEXES
========================= */
spaceSchema.index({ spaceType: 1, "address.city": 1 });
spaceSchema.index({ "address.location": "2dsphere" });
spaceSchema.index({ averageRating: -1 });
spaceSchema.index({ isPublished: 1, isFeatured: -1 });
spaceSchema.index({ approvalStatus: 1, operationalStatus: 1, createdAt: -1 });
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

spaceSchema.virtual("virtualOfficePlans", {
  ref: "VirtualOfficePlan",
  localField: "_id",
  foreignField: "space",
});

spaceSchema.virtual("eventSpace", {
  ref: "EventSpace",
  localField: "_id",
  foreignField: "space",
  justOne: true,
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

spaceSchema.virtual("documents", {
  ref: "SpaceDocument",
  localField: "_id",
  foreignField: "space",
});

spaceSchema.virtual("addons", {
  ref: "Addon",
  localField: "_id",
  foreignField: "space",
});

export default mongoose.model("Space", spaceSchema);
