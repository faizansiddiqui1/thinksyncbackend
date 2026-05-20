import mongoose from "mongoose";

const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String, default: "" },
    s3Key: { type: String, default: "" },
    altText: { type: String, default: "" },
    caption: { type: String, default: "" },
    order: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
  },
  { _id: true },
);

const benefitSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const SERVICE_CATEGORIES = ["legal", "finance", "marketing", "compliance"];
const SHOP_CATEGORIES = ["food", "beverage", "merchandise", "stationery"];

const addonSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["service", "shop"],
      required: true,
      index: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (value) {
          if (this.type === "service") return SERVICE_CATEGORIES.includes(value);
          if (this.type === "shop") return SHOP_CATEGORIES.includes(value);
          return false;
        },
        message: "Invalid category for selected addon type",
      },
    },

    description: {
      type: String,
      default: "",
    },

    benefits: {
      type: [benefitSchema],
      default: [],
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
    },

    images: {
      type: [imageSchema],
      default: [],
    },

    stock: {
      type: Number,
      default: null, // useful for shop items
      min: 0,
    },

    sku: {
      type: String,
      default: "",
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    gstPercentage: {
      type: Number,
      default: 0,
      min: 0,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

addonSchema.index({ space: 1, isActive: 1 });
addonSchema.index({ type: 1, category: 1 });
addonSchema.index({ space: 1, type: 1, isActive: 1 });

export default mongoose.model("Addon", addonSchema);