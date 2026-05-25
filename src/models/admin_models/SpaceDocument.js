import mongoose from "mongoose";

const { Schema } = mongoose;

export const DOCUMENT_TYPES = [
  "UTILITY_BILL",
  "CLIENT_NOC",
  "CLIENT_AGREEMENT",
  "MASTER_AGREEMENT",
  "MASTER_NOC",
  "GST_REGISTRATION",
  "BUSINESS_ADDRESS_PROOF",
  "PROPERTY_TAX_RECEIPT",
  "INTERNET_BILL",
  "AFFIDAVIT",
  "LANDLORD_KYC",
  "OWNER_KYC",
  "BOARD_RESOLUTION",
];

const fileSchema = new Schema(
  {
    url: { type: String },
    s3Key: { type: String },
    originalName: String,
    mimeType: String,
    size: Number,
  },
  { _id: false },
);

const spaceDocumentSchema = new Schema(
  {
    scopeType: {
      type: String,
      enum: ["CITY", "SPACE"],
      required: true,
      index: true,
    },

    city: {
      type: Schema.Types.ObjectId,
      ref: "City",
      index: true,
    },

    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      index: true,
    },

    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      default: null,
      index: true,
    },

    customType: {
      type: String,
      trim: true,
      default: "",
    },

    documentKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    solutionTypes: [
      {
        type: String,
        enum: ["company_registration", "gst_registration", "business_address"],
      },
    ],

    label: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["AVAILABLE", "NOT_AVAILABLE"],
      default: "AVAILABLE",
      index: true,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },

    reviewStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },

    reviewNote: {
      type: String,
      default: "",
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isPlatformSample: {
      type: Boolean,
      default: false,
    },

    isWorkspaceSample: {
      type: Boolean,
      default: false,
    },

    file: {
      type: fileSchema,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    version: {
      type: Number,
      default: 1,
    },

    note: {
      type: String,
      default: "",
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
  },
);

spaceDocumentSchema.pre("validate", function (next) {
  if (this.scopeType === "CITY" && !this.city) {
    return next(new Error("city is required"));
  }

  if (this.scopeType === "SPACE" && !this.space) {
    return next(new Error("space is required"));
  }

  if (this.documentType) {
    this.documentKey = this.documentType.toLowerCase();
  }

  if (!this.documentType && this.customType) {
    this.documentKey = this.customType
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  if (this.status === "AVAILABLE" && (!this.file || !this.file.url)) {
    return next(new Error("file is required when status is AVAILABLE"));
  }

  next();
});

spaceDocumentSchema.index(
  {
    city: 1,
    documentKey: 1,
    scopeType: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      scopeType: "CITY",
      isActive: true,
    },
  },
);

spaceDocumentSchema.index(
  {
    space: 1,
    documentKey: 1,
    scopeType: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      scopeType: "SPACE",
      isActive: true,
    },
  },
);

export default mongoose.model("SpaceDocument", spaceDocumentSchema);
