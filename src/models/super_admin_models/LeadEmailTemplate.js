import mongoose from "mongoose";

const { Schema } = mongoose;

const leadEmailTemplateSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },

    body: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ["booking", "follow_up", "consultant", "lead_nurture", "review_request", "custom"],
      default: "consultant",
      index: true,
    },

    templateType: {
      type: String,
      enum: ["system", "custom"],
      default: "custom",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    visibility: {
      type: String,
      enum: ["super_admin", "consultant", "shared"],
      default: "shared",
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    sourceTemplate: {
      type: Schema.Types.ObjectId,
      ref: "LeadEmailTemplate",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

leadEmailTemplateSchema.index({ name: 1, createdBy: 1 }, { unique: false });
leadEmailTemplateSchema.index({ visibility: 1, createdBy: 1, isActive: 1 });
leadEmailTemplateSchema.index({ category: 1, updatedAt: -1 });

export default mongoose.model("LeadEmailTemplate", leadEmailTemplateSchema);
