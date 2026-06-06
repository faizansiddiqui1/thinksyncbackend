import mongoose from "mongoose";
import { createDocSlug } from "./DocCategory.js";

const { Schema } = mongoose;

const mediaAssetSchema = new Schema(
  {
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    alt: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const videoSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    thumbnailUrl: { type: String, trim: true, default: "" },
    duration: { type: String, trim: true, default: "" },
    provider: { type: String, trim: true, default: "internal" },
  },
  { _id: false },
);

const faqSchema = new Schema(
  {
    question: { type: String, trim: true, required: true },
    answer: { type: String, trim: true, default: "" },
  },
  { _id: true },
);

const relatedDocSchema = new Schema(
  {
    doc: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    title: { type: String, trim: true, default: "" },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    order: { type: Number, default: 100 },
  },
  { _id: true },
);

const contextualLinkSchema = new Schema(
  {
    label: { type: String, trim: true, required: true },
    href: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
  },
  { _id: true },
);

const seoSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    keywords: { type: [String], default: [] },
    canonicalUrl: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    category: {
      type: Schema.Types.ObjectId,
      ref: "DocCategory",
      required: true,
      index: true,
    },
    coverImage: { type: mediaAssetSchema, default: () => ({}) },
    video: { type: videoSchema, default: () => ({}) },
    videoUrl: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "", maxlength: 700 },
    content: { type: String, trim: true, default: "" },
    keyPoints: { type: [String], default: [] },
    useCases: { type: [String], default: [] },
    bestPractices: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    examples: { type: [String], default: [] },
    faq: { type: [faqSchema], default: [] },
    relatedDocs: { type: [relatedDocSchema], default: [] },
    contextualLinks: { type: [contextualLinkSchema], default: [] },
    audience: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    language: { type: String, trim: true, default: "en" },
    version: { type: String, trim: true, default: "v1", index: true },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 100, index: true },
    readingTime: { type: Number, default: 1 },
    seo: { type: seoSchema, default: () => ({}) },
    publishedAt: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

documentSchema.index({ slug: 1, version: 1 }, { unique: true });
documentSchema.index({ category: 1, order: 1 });
documentSchema.index({ status: 1, isActive: 1, order: 1 });
documentSchema.index({
  title: "text",
  summary: "text",
  content: "text",
  tags: "text",
});

function estimateReadingTime(document) {
  const text = [
    document.title,
    document.summary,
    document.content,
    ...(document.keyPoints || []),
    ...(document.useCases || []),
    ...(document.bestPractices || []),
  ].join(" ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

documentSchema.pre("validate", function (next) {
  this.slug = createDocSlug(this.slug || this.title);
  this.videoUrl = this.videoUrl || this.video?.url || "";
  this.readingTime = estimateReadingTime(this);

  if (this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  if (this.status !== "published") {
    this.publishedAt = null;
  }

  next();
});

export default mongoose.models.Document ||
  mongoose.model("Document", documentSchema);
