// models/SMTP.js
import mongoose from "mongoose";

const smtpSchema = new mongoose.Schema(
  {
    host: {
      type: String,
      required: true,
      trim: true,
    },
    port: {
      type: Number,
      required: true,
      min: 1,
      max: 65535,
    },
    secure: {
      type: Boolean,
      default: false,
    },
    username: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // 🚨 hide by default
    },
    fromName: {
      type: String,
      required: true,
    },
    fromEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Invalid from email"],
    },

    provider: {
      type: String,
      enum: ["gmail", "ses", "brevo", "mailgun", "custom"],
      default: "custom",
    },

    priority: {
      type: Number,
      default: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // 🧠 health tracking
    lastFailedAt: Date,
    failCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// 🚀 fast fallback queries
smtpSchema.index({ isActive: 1, priority: 1 }, { unique: true });

export default mongoose.model("SMTP", smtpSchema);
