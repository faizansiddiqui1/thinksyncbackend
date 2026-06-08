import mongoose from "mongoose";

const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const visibilityRulesSchema = new Schema(
  {
    listingIds: [{ type: Schema.Types.ObjectId, ref: "Space" }],
    cityFallback: { type: Boolean, default: false },
    globalFallback: { type: Boolean, default: false },
    hiddenFromPublic: { type: Boolean, default: false },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const socialLinksSchema = new Schema(
  {
    linkedin: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    calendly: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const publicProfileSchema = new Schema(
  {
    bio: { type: String, trim: true, default: "", maxlength: 1200 },
    specializations: { type: [String], default: [] },
    serviceAreas: { type: [String], default: [] },
    experience: { type: String, trim: true, default: "", maxlength: 240 },
    languages: { type: [String], default: [] },
    socialLinks: {
      type: socialLinksSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

const leadRoutingSchema = new Schema(
  {
    enabled: { type: Boolean, default: true, index: true },
    receiveNewLeads: { type: Boolean, default: true, index: true },
    strategy: {
      type: String,
      enum: ["round_robin", "weighted", "manual"],
      default: "round_robin",
    },
    weight: { type: Number, min: 0.1, default: 1 },
    maxDailyLeads: { type: Number, min: 1, default: null },
  },
  { _id: false },
);

const routingStatsSchema = new Schema(
  {
    totalAssigned: { type: Number, min: 0, default: 0 },
    dailyAssignedCount: { type: Number, min: 0, default: 0 },
    dailyAssignedDate: { type: Date, default: null },
    lastAssignedAt: { type: Date, default: null },
  },
  { _id: false },
);

const consultantSchema = new Schema(
  {
    linkedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    profileImage: {
      type: imageSchema,
      default: () => ({}),
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },

    designation: {
      type: String,
      trim: true,
      default: "Workspace Consultant",
      maxlength: 120,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    assignedCities: [
      {
        type: Schema.Types.ObjectId,
        ref: "City",
        index: true,
      },
    ],

    assignedProductTypes: {
      type: [String],
      default: [],
      index: true,
    },

    assignedSpaceTypes: {
      type: [String],
      default: [],
      index: true,
    },

    assignedListingModes: {
      type: [String],
      default: [],
      index: true,
    },

    leadRouting: {
      type: leadRoutingSchema,
      default: () => ({}),
    },

    routingStats: {
      type: routingStatsSchema,
      default: () => ({}),
    },

    priority: {
      type: Number,
      default: 100,
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    publicProfile: {
      type: publicProfileSchema,
      default: () => ({}),
    },

    visibilityRules: {
      type: visibilityRulesSchema,
      default: () => ({}),
    },

    requestApprovalStatus: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "approved",
      index: true,
    },

    sourceOfMapping: {
      type: String,
      enum: ["manual_admin", "import", "default", "system"],
      default: "manual_admin",
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

consultantSchema.index({ isActive: 1, priority: 1 });
consultantSchema.index({ email: 1 }, { unique: true });
consultantSchema.index({ phone: 1 });

consultantSchema.pre("save", function (next) {
  if (this.email) this.email = this.email.trim().toLowerCase();
  if (this.phone) this.phone = this.phone.trim();
  if (this.name) this.name = this.name.trim();
  if (this.designation) this.designation = this.designation.trim();
  if (this.notes) this.notes = this.notes.trim();

  if (this.publicProfile) {
    this.publicProfile.specializations = (this.publicProfile.specializations || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    this.publicProfile.serviceAreas = (this.publicProfile.serviceAreas || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    this.publicProfile.languages = (this.publicProfile.languages || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  this.assignedProductTypes = (this.assignedProductTypes || [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  this.assignedSpaceTypes = (this.assignedSpaceTypes || [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  this.assignedListingModes = (this.assignedListingModes || [])
    .map((value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_"))
    .filter(Boolean);

  next();
});

const Consultant =
  mongoose.models.Consultant || mongoose.model("Consultant", consultantSchema);

let legacyIndexCleanupPromise = null;

export async function dropLegacyConsultantParallelArrayIndexes() {
  if (legacyIndexCleanupPromise) return legacyIndexCleanupPromise;

  legacyIndexCleanupPromise = (async () => {
    const indexes = await Consultant.collection.indexes();
    const arrayFields = ["assignedCities", "assignedProductTypes", "assignedSpaceTypes"];
    const legacyIndexes = indexes.filter((index) => {
      if (!index?.key || index.name === "_id_") return false;
      const arrayKeyCount = arrayFields.filter((field) => index.key[field] !== undefined).length;
      return arrayKeyCount > 1;
    });

    await Promise.all(
      legacyIndexes.map((index) =>
        Consultant.collection.dropIndex(index.name).catch((error) => {
          if (error?.codeName === "IndexNotFound" || error?.code === 27) return null;
          throw error;
        }),
      ),
    );
  })();

  return legacyIndexCleanupPromise;
}

export default Consultant;
