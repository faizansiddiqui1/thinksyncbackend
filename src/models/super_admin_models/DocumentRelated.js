import mongoose from "mongoose";

const { Schema } = mongoose;

const documentRelatedSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    relatedDocument: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },
    title: { type: String, trim: true, default: "" },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    order: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.models.DocumentRelated ||
  mongoose.model("DocumentRelated", documentRelatedSchema);
