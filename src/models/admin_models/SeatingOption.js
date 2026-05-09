import mongoose from "mongoose";
import slugify from "slugify";

const { Schema } = mongoose;

const amenitySchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["shared", "private"],
      default: "shared",
    },
    available: { type: Boolean, default: true },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const imageSchema = new Schema(
  {
    url: { type: String, required: true },
    s3Key: { type: String, required: true },
    altText: { type: String, default: "" },
    caption: { type: String, default: "" },
    order: { type: Number, default: 0 },
    size: { type: Number, default: 0 },
  },
  { _id: true },
);

const seatingOptionSchema = new Schema(
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

    slug: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "dedicated_desk",
        "private_cabin",
        "open_desk",
        "managed_office",
      ],
      required: true,
      index: true,
    },

    shortDescription: {
      type: String,
      default: "",
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
    },

    images: [imageSchema],



   

    // pricing
    pricing: {
      amount: { type: Number, required: true, min: 0 },
      unit: {
        type: String,
        enum: ["per_desk", "per_cabin", "per_month"],
        default: "per_desk",
      },
      billingCycle: {
        type: String,
        enum: ["monthly"],
        default: "monthly",
      },
      currency: { type: String, default: "INR" },
      isNegotiable: { type: Boolean, default: true },
    },

    leaseTerms: {
      minMonths: { type: Number, default: null, min: 0 },
      lockInMonths: { type: Number, default: null, min: 0 },
      securityDepositMonths: { type: Number, default: null, min: 0 },
      noticePeriodMonths: { type: Number, default: null, min: 0 },
    },

    availability: {
      status: {
        type: String,
        enum: ["available", "limited", "sold_out"],
        default: "available",
      },
      availableFrom: { type: Date, default: null },
    },

    furnishing: {
      type: String,
      enum: ["furnished", "semi_furnished", "unfurnished"],
      default: "furnished",
    },

    floor: {
      type: String,
      default: "",
      trim: true,
    },

    amenities: [amenitySchema],

    displayOrder: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    adminNotes: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

seatingOptionSchema.pre("validate", function (next) {
  if (this.isNew && !this.slug && this.title) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

seatingOptionSchema.index({ space: 1, isActive: 1 });
seatingOptionSchema.index({ space: 1, type: 1, isActive: 1 });
seatingOptionSchema.index({ space: 1, displayOrder: 1, isActive: 1 });

export default mongoose.model("SeatingOption", seatingOptionSchema);