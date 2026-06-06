import mongoose from "mongoose";

const { Schema } = mongoose;

const documentVersionSchema = new Schema(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    version: { type: String, trim: true, default: "v1", index: true },
    title: { type: String, trim: true, default: "" },
    slug: { type: String, trim: true, lowercase: true, default: "" },
    changeNote: { type: String, trim: true, default: "" },
    snapshot: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

documentVersionSchema.index({ document: 1, createdAt: -1 });

export default mongoose.models.DocumentVersion ||
  mongoose.model("DocumentVersion", documentVersionSchema);
