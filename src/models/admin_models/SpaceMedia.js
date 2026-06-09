// models/admin_models/SpaceMedia.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String },
    s3Key: { type: String },
    mimeType: { type: String, default: "" },
    altText: { type: String, default: "" },
    caption: { type: String, default: "" },
    order: { type: Number, default: 0 },
    size: Number,
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true },
); 

const videoSchema = new Schema(
  {
    url: String,
    s3Key: { type: String }, 
    mimeType: { type: String, default: "video/mp4" },
    provider: {
      type: String,
      enum: ["youtube", "vimeo", "custom"],
      default: "custom",
    },
    thumbnail: String,
    duration: Number,
    caption: String,
    size: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const spaceMediaSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      unique: true,
      index: true,
    },
    images: [imageSchema],
    video: videoSchema,
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export default mongoose.model("SpaceMedia", spaceMediaSchema);


