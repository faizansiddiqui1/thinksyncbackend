import mongoose from "mongoose";

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileName: { type: String, required: true },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: false },
);

const workspaceDocumentSchema = new Schema(
  {
    scopeType: {
      type: String,
      enum: ["city", "space"],
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
      enum: [
        "utility_bill",
        "client_noc",
        "client_agreement",
        "master_agreement",
        "master_noc",
        "board_resolution_operator",
        "property_tax_receipt",
        "internet_bill",
        "affidavit",
        "landlord_kyc",
        "owner_kyc",
        "board_resolution_landlord",
        "gst_registration",
        "business_address_proof",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
    },

    file: {
      type: fileSchema,
      required: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    version: {
      type: Number,
      default: 1,
      min: 1,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

workspaceDocumentSchema.pre("validate", function (next) {
  if (this.scopeType === "city") {
    if (!this.city) return next(new Error("city is required for city documents"));
    this.space = undefined;
  }

  if (this.scopeType === "space") {
    if (!this.space) return next(new Error("space is required for space documents"));
  }

  next();
});

workspaceDocumentSchema.index(
  { scopeType: 1, city: 1, documentType: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: "city" },
  },
);

workspaceDocumentSchema.index(
  { scopeType: 1, space: 1, documentType: 1 },
  {
    unique: true,
    partialFilterExpression: { scopeType: "space" },
  },
);

workspaceDocumentSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.model("WorkspaceDocument", workspaceDocumentSchema);