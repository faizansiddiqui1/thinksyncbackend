import mongoose from "mongoose";

const { Schema } = mongoose;

const emailTemplateSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "authentication",
        "booking",
        "enquiry",
        "kyc",
        "notification",
        "review",
        "security",
        "marketing",
        "consultant",
        "system",
      ],
      default: "system",
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    html: {
      type: String,
      required: true,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isSystem: {
      type: Boolean,
      default: false,
    },

    visibility: {
      type: String,
      enum: ["system", "shared", "private"],
      default: "private",
      index: true,
    },

    ownerRole: {
      type: String,
      enum: ["super_admin", "admin", "company_admin", "consultant", "system"],
      default: "system",
      index: true,
    },

    allowedVariables: {
      type: [String],
      default: [],
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

emailTemplateSchema.index({
  displayName: "text",
  description: "text",
  name: "text",
});
emailTemplateSchema.index({ createdBy: 1, visibility: 1, updatedAt: -1 });

export default
  mongoose.models.EmailTemplate ||
  mongoose.model("EmailTemplate", emailTemplateSchema);
