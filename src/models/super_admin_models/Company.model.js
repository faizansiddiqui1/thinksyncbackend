// models/Company.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const companySchema = new Schema(
  {
    // 🔹 Basic Info
    legalName: {
      type: String,
      required: true,
      trim: true,
    },

    displayName: {
      type: String,
      trim: true,
    },

    // 🔹 Contact Info
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },

    whatsappNumber: {
      type: String,
      trim: true,
    },
    // 🔥 🔥 🔥 MAIN CHANGE
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // 🔥 IMPORTANT
    },
    // 🔹 Office Assignment
    assignedSpaceId: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true, // 🔥 important (office assign at creation)
    },

    // 🔹 Optional (future ready)
    address: {
      type: String,
      trim: true,
    },

    city: String,
    state: String,
    country: String,

    // 🔹 Business Info
    gstNumber: String,
    cinNumber: String,
    panNumber: String,

    // 🔹 Employees (future ready)
    employees: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        role: {
          type: String,
          enum: ["employee", "manager"],
          default: "employee",
        },
        // 🔥 ADD THIS
        spaces: [
          {
            type: Schema.Types.ObjectId,
            ref: "Space",
          },
        ],
      },
    ],

    // 🔹 Status
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "active",
    },

    // 🔹 Tracking
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // super admin
    },

    type: {
      type: String,
      enum: ["private_office_company", "managed_office_company"],
      default: "private_office_company",
    },

    // 🔹 Future (multi-space support)
    spaces: [
      {
        type: Schema.Types.ObjectId,
        ref: "Space",
      },
    ],
  },
  { timestamps: true },
);

companySchema.index({ "employees.user": 1 }, { unique: true, sparse: true });

export default mongoose.model("Company", companySchema);
