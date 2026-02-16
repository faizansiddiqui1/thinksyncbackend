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
    managers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    company: {
      name: String,
      registrationNumber: String,
      address: String,
      placeholderImageKey: String, // for pictures
      legalDocuments: [DocumentSchema],
    },
    kyc: { type: KycSchema, default: () => ({}) },
    createdAt: Date,
    updatedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("AdminProfile", AdminProfileSchema);
