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

    consultantId: {
      type: Schema.Types.ObjectId,
      ref: "Consultant",
      default: null,
      index: true,
    },

    listingId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      default: null,
      index: true,
    },

    listingName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    listingSlug: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    city: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    product: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    spaceType: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },

    pageType: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    sourceUrl: {
      type: String,
      trim: true,
      default: "",
    },

    utm: {
      source: { type: String, trim: true, default: "" },
      medium: { type: String, trim: true, default: "" },
      campaign: { type: String, trim: true, default: "" },
      term: { type: String, trim: true, default: "" },
      content: { type: String, trim: true, default: "" },
    },

    device: {
      userAgent: { type: String, trim: true, default: "" },
      ip: { type: String, trim: true, default: "" },
      referrer: { type: String, trim: true, default: "" },
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
        "consultant",
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
      enum: [
        "website",
        "landing_request_callback",
        "whatsapp",
        "call",
        "manual",
        "ads",
        "other",
      ],
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
      enum: [
        "new",
        "contacted",
        "interested",
        "follow-up",
        "qualified",
        "closed",
        "lost",
        "converted",
        "rejected",
      ],
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

    assignmentHistory: [
      {
        consultant: { type: Schema.Types.ObjectId, ref: "Consultant", default: null },
        previousConsultant: { type: Schema.Types.ObjectId, ref: "Consultant", default: null },
        assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        reason: { type: String, trim: true, default: "" },
        assignedAt: { type: Date, default: Date.now },
      },
    ],

    leadNotes: [
      {
        note: { type: String, trim: true, required: true },
        addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    callLogs: [
      {
        outcome: { type: String, trim: true, default: "" },
        notes: { type: String, trim: true, default: "" },
        calledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        calledAt: { type: Date, default: Date.now },
      },
    ],

    emailLogs: [
      {
        templateId: { type: Schema.Types.ObjectId, ref: "LeadEmailTemplate", default: null },
        subject: { type: String, trim: true, default: "" },
        status: {
          type: String,
          enum: ["queued", "sent", "failed", "logged"],
          default: "logged",
        },
        error: { type: String, trim: true, default: "" },
        sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
        sentAt: { type: Date, default: Date.now },
      },
    ],
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
enquirySchema.index({ consultantId: 1, status: 1, createdAt: -1 });
enquirySchema.index({ city: 1, product: 1, status: 1, createdAt: -1 });
enquirySchema.index({ listingId: 1, createdAt: -1 });
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
  if (this.listingName) this.listingName = this.listingName.trim();
  if (this.listingSlug) this.listingSlug = this.listingSlug.trim().toLowerCase();
  if (this.city) this.city = this.city.trim();
  if (this.product) this.product = this.product.trim().toLowerCase();
  if (this.spaceType) this.spaceType = this.spaceType.trim().toLowerCase();
  if (this.pageType) this.pageType = this.pageType.trim();
  if (this.sourceUrl) this.sourceUrl = this.sourceUrl.trim();
  next();
});

const Enquiry = mongoose.model("Enquiry", enquirySchema);
export default Enquiry;
