import mongoose from "mongoose";

const { Schema } = mongoose;

const VirtualOfficePlanSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    category: {
      type: String,
      enum: ["company_registration", "gst_registration", "business_address"],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    durationMonths: {
      type: Number,
      required: true,
      enum: [12, 24, 36],
      index: true,
    },

    price: {
      monthly: {
        type: Number,
        required: true,
        min: 0,
      },
      total: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "INR",
      },
    },

    whatYouGet: {
      type: [String],
      default: [],
    },

    inclusions: {
      type: [String],
      default: [],
    },

    features: {
      type: [String],
      default: [],
    },

    popular: {
      type: Boolean,
      default: false,
    },

    order: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

VirtualOfficePlanSchema.index({ space: 1, category: 1, order: 1 });
VirtualOfficePlanSchema.index({ space: 1, durationMonths: 1 });
VirtualOfficePlanSchema.index({ space: 1, popular: -1 });

export default mongoose.model("VirtualOfficePlan", VirtualOfficePlanSchema);