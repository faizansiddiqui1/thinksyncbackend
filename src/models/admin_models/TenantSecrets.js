// models/TenantSecrets.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const TenantSecretsSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
    },

    // 🔹 CASHFREE
    cashfree: {
      clientId: String,
      clientSecret: String,
      env: {
        type: String,
        enum: ["sandbox", "production"],
        default: "sandbox",
      },
    },
    razorpay: {
      keyId: String,
      keySecret: String,
      webhookSecret: String,
    },

    // 🔹 SMTP
    smtp: {
      host: String,
      port: Number,
      username: String,
      password: String,
      fromName: String,
      fromEmail: String,
    },

    // 🔹 AWS S3
    aws: {
      accessKeyId: String,
      secretAccessKey: String,
      region: String,
      bucketName: String,
    },

    // 🔹 GOOGLE MAPS
    google: {
      apiKey: String,
      placesComponents: String,
    },

    // 🔹 MSG91 (SMS)
    msg91: {
      authKey: String,
      senderId: String,
      route: String,
      country: String,
      templateId: String,
    },
    hardware: {
      provider: String,
      apiKey: String,
      secret: String,
    },

    updatedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("TenantSecrets", TenantSecretsSchema);
