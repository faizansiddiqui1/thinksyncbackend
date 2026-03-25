// models/admin_models/AdminProfile.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const DocumentSchema = new Schema(
  {
    key: String, // S3 key or storage ref
    type: String, // passport, business_license, etc
    uploadedAt: Date,
    status: {
      type: String,
      enum: ["uploaded", "validated", "rejected"],
      default: "uploaded",
    },
    meta: Schema.Types.Mixed,
  },
  { _id: false },
);

const KycSchema = new Schema({
  status: {
    type: String,
    enum: ["not_submitted", "pending", "approved", "rejected"],
    default: "not_submitted",
  },

  // 👇 ADD THIS BLOCK
  // config: {
  //   requireFaceMatch: { type: Boolean, default: true },
  //   requirePan: { type: Boolean, default: true },
  //   requireCin: { type: Boolean, default: true },
  //   requireVideoKyc: { type: Boolean, default: true },
  //   requireBankCheack: { type: Boolean, default: true },
  //   requireGstin: { type: Boolean, default: true }
  // },

  /**  ===================================================
  Direct  add in db in under adminProfile
  adminprofiles
  ADD DATA → Insert Document
  Paste this ⬇️⬇️⬇️

{
  "owner": null,
  "company": { "name": "GLOBAL_DEFAULT" },
  "kyc": {
    "config": {
      "requirePan": true,
      "requireGstin": true,
      "requireCin": true,
      "requireCompanyPan": true,
      "requireBankCheck": true,
      requireAadhaar: true,
      "requireFaceMatch": false
    }
  }
}
=================================================== */

  submittedAt: Date,
  reviewedAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reason: String,
  documents: [DocumentSchema],
});

const AdminProfileSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    company: {
      name: String,
      registrationNumber: String,
      address: String,
      placeholderImageKey: String, // for pictures
      legalDocuments: [DocumentSchema],
    },
    // models/admin_models/AdminProfile.js

    whiteLabel: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      approvedAt: Date,
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // super admin
      },
    },
    kyc: { type: KycSchema, default: () => ({}) },
    createdAt: Date,
    updatedAt: Date,
  },
  { timestamps: true },
);

AdminProfileSchema.index(
  { "company.name": 1 },
  {
    unique: true,
    partialFilterExpression: { "company.name": "GLOBAL_DEFAULT" },
  },
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
