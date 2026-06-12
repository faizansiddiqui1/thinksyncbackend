import mongoose from "mongoose";
const { Schema } = mongoose;

const DocumentSchema = new Schema(
  {
    key: String,
    type: String,
    uploadedAt: Date,
    status: {
      type: String,
      enum: ["uploaded", "validated", "rejected"],
      default: "uploaded",
    },
    meta: Schema.Types.Mixed,
  },
  { _id: false }
);

const KycConfigSchema = new Schema(
  {
    requirePan: { type: Boolean, default: true },
    requireAadhaar: { type: Boolean, default: true },
    requireGstin: { type: Boolean, default: false },
    requireCin: { type: Boolean, default: false },
    requireCompanyPan: { type: Boolean, default: false },
    requireFaceMatch: { type: Boolean, default: false },
    requireBankCheack: { type: Boolean, default: false },
  },
  { _id: false },
);

const KycSchema = new Schema({
  status: {
    type: String,
    enum: ["not_submitted", "pending", "approved", "rejected"],
    default: "not_submitted",
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reason: String,
  documents: [DocumentSchema],
  config: { type: KycConfigSchema, default: () => ({}) },
});

const RecoveryChannelSchema = new Schema(
  {
    value: {
      type: String,
      trim: true,
      default: "",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const EmergencyContactSchema = new Schema(
  {
    name: { type: String, trim: true, default: "" },
    relation: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const NotificationSchema = new Schema(
  {
    securityAlerts: { type: Boolean, default: true },
    approvalTasks: { type: Boolean, default: true },
    bookingAlerts: { type: Boolean, default: true },
    billingAlerts: { type: Boolean, default: false },
    operationsAlerts: { type: Boolean, default: true },
  },
  { _id: false },
);

const PreferenceSchema = new Schema(
  {
    defaultDashboard: { type: String, trim: true, default: "" },
    timezone: { type: String, trim: true, default: "Asia/Calcutta" },
    locale: { type: String, trim: true, default: "en-IN" },
  },
  { _id: false },
);

const SecuritySchema = new Schema(
  {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorMethod: {
      type: String,
      enum: ["none", "totp", "otp"],
      default: "none",
    },
    trustedDevices: {
      type: [
        new Schema(
          {
            label: { type: String, trim: true, default: "" },
            fingerprint: { type: String, trim: true, default: "" },
            lastSeenAt: { type: Date, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    lastSecurityReviewAt: { type: Date, default: null },
  },
  { _id: false },
);

const RoleScopeSchema = new Schema(
  {
    linkedCompanyIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Company" }],
      default: [],
    },
    linkedWorkspaceIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Space" }],
      default: [],
    },
    consultantScope: {
      assignedCityIds: {
        type: [{ type: Schema.Types.ObjectId, ref: "City" }],
        default: [],
      },
      productTypes: {
        type: [String],
        default: [],
      },
      spaceTypes: {
        type: [String],
        default: [],
      },
      listingModes: {
        type: [String],
        default: [],
      },
    },
  },
  { _id: false },
);

const AuditSchema = new Schema(
  {
    lastSensitiveProfileUpdateAt: {
      type: Date,
      default: null,
    },
    lastSensitiveProfileUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

const AdminProfileSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    adminType: {
      type: String,
      enum: ["admin", "super_admin", "company_admin", "consultant"],
      default: "admin",
    },

    designation: {
      type: String,
      trim: true,
      default: "",
    },

    department: {
      type: String,
      trim: true,
      default: "",
    },

    staffCode: {
      type: String,
      trim: true,
      default: "",
    },

    recovery: {
      email: {
        type: RecoveryChannelSchema,
        default: () => ({}),
      },
      phone: {
        type: RecoveryChannelSchema,
        default: () => ({}),
      },
    },

    emergencyContact: {
      type: EmergencyContactSchema,
      default: () => ({}),
    },

    notifications: {
      type: NotificationSchema,
      default: () => ({}),
    },

    preferences: {
      type: PreferenceSchema,
      default: () => ({}),
    },

    security: {
      type: SecuritySchema,
      default: () => ({}),
    },

    roleScope: {
      type: RoleScopeSchema,
      default: () => ({}),
    },

    audit: {
      type: AuditSchema,
      default: () => ({}),
    },

    company: {
      name: String,
      registrationNumber: String,
      address: String,
      placeholderImageKey: String,
      legalDocuments: [DocumentSchema],
    },

    whiteLabel: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },

      useOwnPlatformCredentials: {
        type: Boolean,
        default: false,
      },

      request: {
        personalBranding: {
          type: Boolean,
          default: false,
        },

        needsCustomDomain: {
          type: Boolean,
          default: false,
        },

        requestedDomain: {
          type: String,
          default: null,
        },

        wantsFullCustomization: {
          type: Boolean,
          default: false,
        },

        paymentMode: {
          type: String,
          enum: ["platform", "own_gateway"],
          default: "platform",
        },

        useOwnCredentials: {
          type: Boolean,
          default: false,
        },

        needsHardwareAccess: {
          type: Boolean,
          default: false,
        },

        businessName: {
          type: String,
          trim: true,
          default: "",
        },

        businessAge: {
          type: String,
          trim: true,
          default: "",
        },

        contactName: {
          type: String,
          trim: true,
          default: "",
        },

        contactPhone: {
          type: String,
          trim: true,
          default: "",
        },

        needsGuidance: {
          type: Boolean,
          default: false,
        },

        notes: {
          type: String,
          trim: true,
          default: "",
        },

        submittedAt: {
          type: Date,
          default: null,
        },
      },

      domain: {
        requestedDomain: String,
        activeDomain: String,
        verified: {
          type: Boolean,
          default: false,
        },
        dnsConfigured: {
          type: Boolean,
          default: false,
        },
      },

      approvedAt: Date,

      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      rejectedAt: Date,

      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      reason: {
        type: String,
        trim: true,
        default: "",
      },

      remarks: {
        type: String,
        trim: true,
        default: "",
      },

      permissions: {
        customDomain: {
          type: Boolean,
          default: false,
        },
        customBranding: {
          type: Boolean,
          default: false,
        },
        privateMode: {
          type: Boolean,
          default: false,
        },
      },

      marketplaceMode: {
        type: String,
        enum: ["marketplace", "private"],
        default: "marketplace",
      },
    },

    kyc: { type: KycSchema, default: () => ({}) },
  },
  { timestamps: true }
);

AdminProfileSchema.index(
  { "company.name": 1 },
  {
    unique: true,
    partialFilterExpression: { "company.name": "GLOBAL_DEFAULT" },
  }
);

AdminProfileSchema.pre("deleteOne", { document: true }, function (next) {
  if (this.company?.name === "GLOBAL_DEFAULT") {
    return next(new Error("Cannot delete global config"));
  }
  next();
});

AdminProfileSchema.pre("deleteMany", function (next) {
  if (this.getQuery()?.["company.name"] === "GLOBAL_DEFAULT") {
    return next(new Error("Cannot delete global config"));
  }
  next();
});

export default mongoose.model("AdminProfile", AdminProfileSchema);
