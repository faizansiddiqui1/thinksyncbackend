// models/admin_models/SpaceMedia.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String },
    s3Key: { type: String },
    altText: { type: String, default: "" },
    caption: { type: String, default: "" },
    order: { type: Number, default: 0 },
    size: Number,
  },
  { _id: true },
); 

const videoSchema = new Schema(
  {
    url: String,
    s3Key: { type: String }, 
    provider: {
      type: String,
      enum: ["youtube", "vimeo", "custom"],
      default: "custom",
    },
    thumbnail: String,
    duration: Number,
    caption: String,
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


