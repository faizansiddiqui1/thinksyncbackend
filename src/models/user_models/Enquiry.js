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

    teamSize: {
      type: Number,
      min: 1,
      default: null,
    },

    // Keep simple text budget for form compatibility
    budget: {
      type: String,
      trim: true,
      default: "",
    },

    // Optional structured budget for future filtering/reporting
    budgetRange: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      currency: { type: String, default: "INR", trim: true },
    },

    moveInDate: {
      type: Date,
      default: null,
    },

    details: {
      type: String,
      trim: true,
      default: "",
    },

    preferredContactMethod: {
      type: String,
      enum: ["call", "whatsapp", "email", "any"],
      default: "any",
    },

    // Optional relation to a space/listing
    spaceId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      default: null,
      index: true,
    },

    // Optional relation to a specific resource/listing card
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
      index: true,
    },

    // Who submitted it
    submittedByUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    submittedByAdminProfile: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
      default: null,
      index: true,
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
      index: true,
    },

    leadSource: {
      type: String,
      enum: ["website", "whatsapp", "call", "manual", "ads", "other"],
      default: "website",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
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
      index: true,
    },

    convertedCompanyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
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
  },
);

// Useful indexes
enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ spaceId: 1, status: 1, createdAt: -1 });
enquirySchema.index({ resourceId: 1, status: 1, createdAt: -1 });
enquirySchema.index({ email: 1, createdAt: -1 });
enquirySchema.index({ phoneNumber: 1, createdAt: -1 });

// Small cleanup before save
enquirySchema.pre("save", function (next) {
  if (this.email) this.email = this.email.trim().toLowerCase();
  if (this.phoneNumber) this.phoneNumber = this.phoneNumber.trim();
  if (this.companyName) this.companyName = this.companyName.trim();
  if (this.details) this.details = this.details.trim();
  if (this.notes) this.notes = this.notes.trim();
  if (this.budget) this.budget = this.budget.trim();
  next();
});

const Enquiry = mongoose.model("Enquiry", enquirySchema);
export default Enquiry;