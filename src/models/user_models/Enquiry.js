// models/Enquiry.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const enquirySchema = new Schema(
  {
    // Basic form fields
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      index: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      index: true,
    },

    companyName: {
      type: String,
      trim: true,
      default: "",
    },

    budget: {
      type: String,
      trim: true,
      default: "",
    },

    details: {
      type: String,
      trim: true,
      default: "",
    },

    // Optional relation to a space/listing
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      default: null,
    },

    // Who submitted it
    submittedByUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    submittedByAdminProfile: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
      default: null,
    },

    submittedByRole: {
      type: String,
      enum: [
        "public",
        "user",
        "pending_admin",
        "admin",
        "super_admin",
        "company_admin",
        "employee",
      ],
      default: "public",
    },

    source: {
      type: String,
      enum: ["public_form", "logged_in_user", "logged_in_admin", "manual_admin"],
      default: "public_form",
    },

    status: {
      type: String,
      enum: ["new", "contacted", "converted", "rejected"],
      default: "new",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    assignedSpaceId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      default: null,
    },

    convertedCompanyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },

    contactedAt: {
      type: Date,
      default: null,
    },

    convertedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ status: 1, createdAt: -1 });

const Enquiry = mongoose.model("Enquiry", enquirySchema);
export default Enquiry;