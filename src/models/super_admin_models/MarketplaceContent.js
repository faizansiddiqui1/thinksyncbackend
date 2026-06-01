import mongoose from "mongoose";

const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const seoSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    keywords: { type: [String], default: [] },
  },
  { _id: false },
);

const sectionSchema = new Schema(
  {
    sectionType: { type: String, trim: true, required: true },
    title: { type: String, trim: true, default: "" },
    subtitle: { type: String, trim: true, default: "" },
    content: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    ctaLabel: { type: String, trim: true, default: "" },
    ctaHref: { type: String, trim: true, default: "" },
    items: { type: [Schema.Types.Mixed], default: [] },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: true },
);

const marketplaceContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["offers", "partners", "testimonials", "blogs", "pages"],
      required: true,
      index: true,
    },

    slug: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
    },

    title: { type: String, trim: true, required: true, maxlength: 180 },
    subtitle: { type: String, trim: true, default: "" },
    excerpt: { type: String, trim: true, default: "", maxlength: 500 },
    content: { type: String, trim: true, default: "" },

    image: { type: imageSchema, default: () => ({}) },
    logo: { type: imageSchema, default: () => ({}) },

    code: { type: String, trim: true, uppercase: true, default: "" },
    discountType: {
      type: String,
      enum: ["percentage", "flat", "special", ""],
      default: "",
    },
    discountValue: { type: Number, default: 0 },
    minBookingAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: null },
    validFrom: { type: Date, default: null },
    validTill: { type: Date, default: null },
    firstBookingOnly: { type: Boolean, default: false },
    perUserUsageLimit: { type: Number, default: 1 },
    totalUsageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },

    partnerName: { type: String, trim: true, default: "" },
    partnerUrl: { type: String, trim: true, default: "" },

    personName: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    company: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    rating: { type: Number, min: 0, max: 5, default: 5 },

    author: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "" },
    readTime: { type: String, trim: true, default: "" },

    ctaLabel: { type: String, trim: true, default: "" },
    ctaHref: { type: String, trim: true, default: "" },

    sections: { type: [sectionSchema], default: [] },
    seo: { type: seoSchema, default: () => ({}) },
    metadata: { type: Schema.Types.Mixed, default: {} },

    priority: { type: Number, default: 100, index: true },
    isActive: { type: Boolean, default: true, index: true },
    publishedAt: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

marketplaceContentSchema.index({ type: 1, slug: 1 }, { unique: true });
marketplaceContentSchema.index({ type: 1, isActive: 1, priority: 1 });
marketplaceContentSchema.index(
  { type: 1, code: 1 },
  { unique: true, partialFilterExpression: { type: "offers", code: { $gt: "" } } },
);

function slugify(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

marketplaceContentSchema.pre("validate", function (next) {
  if (!this.slug) {
    this.slug = slugify(this.title || this.code || this.partnerName || this.personName);
  } else {
    this.slug = slugify(this.slug);
  }

  if (this.code) {
    this.code = String(this.code).trim().toUpperCase();
  }

  if (!this.publishedAt && this.isActive) {
    this.publishedAt = new Date();
  }

  next();
});

export function createContentSlug(value = "") {
  return slugify(value);
}

export default mongoose.models.MarketplaceContent ||
  mongoose.model("MarketplaceContent", marketplaceContentSchema);
