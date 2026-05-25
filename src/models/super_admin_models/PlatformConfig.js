import mongoose from "mongoose";

const platformConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    valueType: {
      type: String,
      required: true,
      enum: ["string", "number", "boolean", "json"],
    },
    isSensitive: {
      type: Boolean,
      default: false,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    encryptedValue: {
      type: String,
      default: null,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("PlatformConfig", platformConfigSchema);
