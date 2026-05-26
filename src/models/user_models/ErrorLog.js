import mongoose from "mongoose";

const errorLogSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["frontend", "backend"],
      required: true,
      index: true,
    },

    severity: {
      type: String,
      enum: ["critical", "error", "warning", "info"],
      default: "error",
      index: true,
    },

    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },

    code: {
      type: String,
      default: "",
    },

    stackTrace: {
      type: String,
      default: "",
      maxlength: 5000,
    },

    context: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      url: { type: String, default: "" },
      method: { type: String, default: "" },
      statusCode: { type: Number, default: null },
      userAgent: { type: String, default: "" },
      ip: { type: String, default: "" },
    },

    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolvedAt: Date,

    notes: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    frequency: {
      count: { type: Number, default: 1 },
      lastOccurrence: Date,
    },
  },
  { timestamps: true },
);

errorLogSchema.index({ severity: 1, createdAt: -1 });
errorLogSchema.index({ resolved: 1, createdAt: -1 });
errorLogSchema.index({ source: 1, createdAt: -1 });

export default mongoose.models.ErrorLog || mongoose.model("ErrorLog", errorLogSchema);
