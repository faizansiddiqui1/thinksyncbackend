import mongoose from "mongoose";

const { Schema } = mongoose;

const errorLogSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "frontend",
        "backend",
        "api",
        "database",
        "payment",
        "auth",
        "server",
        "runtime",
        "unknown",
      ],
      default: "unknown",
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    stack: {
      type: String,
      default: "",
      maxlength: 20000,
    },

    route: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    method: {
      type: String,
      default: "",
      trim: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    userAgent: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    ipAddress: {
      type: String,
      default: "",
      maxlength: 200,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
      index: true,
    },

    statusCode: {
      type: Number,
      default: null,
      index: true,
    },

    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    environment: {
      type: String,
      default: process.env.NODE_ENV || "development",
    },

    fingerprint: {
      type: String,
      default: "",
      index: true,
    },

    occurrenceCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    lastOccurredAt: {
      type: Date,
      default: Date.now,
    },

    lastAlertAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

errorLogSchema.index({
  fingerprint: 1,
  createdAt: -1,
});

errorLogSchema.index({
  resolved: 1,
  severity: 1,
  createdAt: -1,
});

export default mongoose.models.ErrorLog || mongoose.model("ErrorLog", errorLogSchema);
