import mongoose from "mongoose";

const { Schema } = mongoose;

const documentVideoSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    title: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    thumbnailUrl: { type: String, trim: true, default: "" },
    duration: { type: String, trim: true, default: "" },
    provider: { type: String, trim: true, default: "internal" },
    order: { type: Number, default: 100 },
    isPrimary: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.models.DocumentVideo ||
  mongoose.model("DocumentVideo", documentVideoSchema);
