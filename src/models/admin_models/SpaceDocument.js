// models/admin_models/SpaceDocument.js

import mongoose from "mongoose";

const { Schema } = mongoose;

/* =========================
   DEFAULT DOCUMENT TYPES
========================= */

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

/* =========================
   FILE
========================= */

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

/* =========================
   SPACE DOCUMENT
========================= */

const spaceDocumentSchema = new Schema(
  {
    /* -------------------------
       CITY DEFAULT
       SPACE CUSTOM
    ------------------------- */

    scopeType: {
      type: String,
      enum: ["CITY", "SPACE"],
      required: true,
      index: true,
    },

    /* -------------------------
       CITY LEVEL DOC
    ------------------------- */

    city: {
      type: Schema.Types.ObjectId,
      ref: "City",
      index: true,
    },

    /* -------------------------
       WORKSPACE LEVEL DOC
    ------------------------- */

    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      index: true,
    },

    /* -------------------------
       DOCUMENT TYPE
    ------------------------- */

    // fixed type
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      default: null,
      index: true,
    },

    // custom type support
    customType: {
      type: String,
      trim: true,
      default: "",
    },

    // final resolved key
    // utility_bill OR company_kyc etc
    documentKey: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /* -------------------------
       DOCUMENT LABEL
    ------------------------- */

    label: {
      type: String,
      required: true,
      trim: true,
    },

    /* -------------------------
       AVAILABLE / NOT AVAILABLE
    ------------------------- */

    status: {
      type: String,
      enum: ["AVAILABLE", "NOT_AVAILABLE"],
      default: "AVAILABLE",
      index: true,
    },

    /* -------------------------
       SAMPLE TYPE
    ------------------------- */

    // uploaded by platform owner
    isPlatformSample: {
      type: Boolean,
      default: false,
    },

    // uploaded by workspace owner
    isWorkspaceSample: {
      type: Boolean,
      default: false,
    },

    /* -------------------------
       FILE
    ------------------------- */

    file: {
      type: fileSchema,
      default: null,
    },

    /* -------------------------
       SETTINGS
    ------------------------- */

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

    /* -------------------------
       AUDIT
    ------------------------- */

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

/* =========================
   VALIDATIONS
========================= */

spaceDocumentSchema.pre("validate", function (next) {
  /* -------------------------
     CITY VALIDATION
  ------------------------- */

  if (this.scopeType === "CITY" && !this.city) {
    return next(new Error("city is required"));
  }

  /* -------------------------
     SPACE VALIDATION
  ------------------------- */

  if (this.scopeType === "SPACE" && !this.space) {
    return next(new Error("space is required"));
  }

  /* -------------------------
     DOCUMENT KEY
  ------------------------- */

  // default type
  if (this.documentType) {
    this.documentKey = this.documentType.toLowerCase();
  }

  // custom type
  if (!this.documentType && this.customType) {
    this.documentKey = this.customType
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  /* -------------------------
     FILE VALIDATION
  ------------------------- */

  // file required only when available
  if (
    this.status === "AVAILABLE" &&
    (!this.file || !this.file.url)
  ) {
    return next(
      new Error("file is required when status is AVAILABLE"),
    );
  }

  next();
});

/* =========================
   INDEXES
========================= */

// CITY DEFAULT DOCS

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

// WORKSPACE CUSTOM DOCS

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

export default mongoose.model(
  "SpaceDocument",
  spaceDocumentSchema,
);