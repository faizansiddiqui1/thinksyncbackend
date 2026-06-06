import mongoose from "mongoose";

const { Schema } = mongoose;

const seoSchema = new Schema(
  {
    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    keywords: { type: [String], default: [] },
  },
  { _id: false },
);

const docCategorySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: "" },
    icon: { type: String, trim: true, default: "book-open" },
    parentCategory: {
      type: Schema.Types.ObjectId,
      ref: "DocCategory",
      default: null,
      index: true,
    },
    order: { type: Number, default: 100, index: true },
    isActive: { type: Boolean, default: true, index: true },
    seo: { type: seoSchema, default: () => ({}) },
    deletedAt: { type: Date, default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

docCategorySchema.index({ slug: 1 }, { unique: true });
docCategorySchema.index({ isActive: 1, order: 1 });

export function createDocSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

docCategorySchema.pre("validate", function (next) {
  this.slug = createDocSlug(this.slug || this.title);
  next();
});

export default mongoose.models.DocCategory ||
  mongoose.model("DocCategory", docCategorySchema);
