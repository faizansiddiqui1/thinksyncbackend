// models/tenant.model.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const TenantSchema = new Schema(
  {
    // 🔹 Company / Brand Name
    name: {
      type: String,
    //   required: true,
      trim: true,
    },

    // 🔥 DOMAIN (main SaaS identifier)
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // 🔗 Admin Profile (business owner)
    adminProfileId: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
      required: true,
    },

    // 🔗 Owner user (login user)
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔹 Status control
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },

    // 🔹 Optional SaaS settings
    settings: {
      timezone: {
        type: String,
        default: "Asia/Kolkata",
      },
      currency: {
        type: String,
        default: "INR",
      },
    },
  },
  { timestamps: true }
);

// 🔥 Index (important for fast lookup)
export default mongoose.model("Tenant", TenantSchema);
