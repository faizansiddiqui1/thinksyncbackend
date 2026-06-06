import mongoose from "mongoose";

const { Schema } = mongoose;

const documentFAQSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    question: { type: String, trim: true, required: true },
    answer: { type: String, trim: true, default: "" },
    order: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.models.DocumentFAQ ||
  mongoose.model("DocumentFAQ", documentFAQSchema);
