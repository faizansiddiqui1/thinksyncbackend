// models/User.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const REFRESH_TOKEN_TTL_SECONDS = Number(
  process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30,
); // 30 days

const RefreshTokenSchema = new Schema({
  token: { type: String, required: true },
  ip: String,
  userAgent: String,
  createdAt: {
    type: Date,
    default: Date.now,
    expires: REFRESH_TOKEN_TTL_SECONDS,
  },
  lastUsedAt: Date,
});

const KycSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["not_submitted", "pending", "approved", "rejected"],
      default: "not_submitted",
    },

    aadhaar: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      url: String,
      s3Key: String,
      uploadedAt: Date,
      ocr: {
        raw: Object,
        verified: Boolean,
      },
    },
    selfie: {
      url: String,
      s3Key: String,
      uploadedAt: Date,
    },
    pan: {
      status: {
        type: String,
        enum: ["pending", "verified", "rejected"],
        default: "pending",
      },
      url: String,
      s3Key: String,
      uploadedAt: Date,
      data: Object,
    },
    cin: {
      url: String,
      s3Key: String,
      uploadedAt: Date,
      data: Object,
    },
    gst: {
      url: String,
      s3Key: String,
      uploadedAt: Date,
      data: Object,
    },

    submittedAt: Date,
    reviewedAt: Date,
    data: { type: Schema.Types.Mixed },
    rejectedReason: String,
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
        },
        message: "Please provide a valid email address",
      },
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [20, "Username cannot exceed 20 characters"],
    },

    displayName: {
      type: String,
      trim: true,
      maxlength: [70, "Display name cannot exceed 70 characters"],
      default: "",
    },

    bio: {
      type: String,
      trim: true,
      maxlength: [240, "Bio cannot exceed 240 characters"],
      default: "",
    },

    website: {
      type: String,
      trim: true,
      maxlength: [240, "Website cannot exceed 240 characters"],
      default: "",
    },

    profileImage: {
      url: {
        type: String,
        trim: true,
        default: "",
      },
      s3Key: {
        type: String,
        trim: true,
        default: "",
      },
      uploadedAt: {
        type: Date,
        default: null,
      },
    },

    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
    },

    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^\+?[\d\s\-()]+$/.test(v);
        },
        message: "Please provide a valid phone number",
      },
    },

    // inside userSchema definition
    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    pendingEmailRequestedAt: Date,

    pendingPhone: {
      type: String,
      trim: true,
    },
    pendingPhoneRequestedAt: Date,

    password: {
      type: String,
      select: false, // hide by default
    },

    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["user", "admin", "super_admin", "pending_admin", "consultant"],
      default: "user",
    },
    customRoles: [
      {
        type: Schema.Types.ObjectId,
        ref: "Role",
      },
    ],

    kyc: { type: KycSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },

    loginAttempts: { type: Number, default: 0 },

    lockUntil: Date,

    refreshTokens: {
      type: [RefreshTokenSchema],
      select: false,
    },
    
    lastLogin: Date,
    otpHash: String,
    otpExpires: Date,
    otpAttempts: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.incLoginAttempts = function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
  const lockTimeMs = Number(
    process.env.ACCOUNT_LOCK_TIME_MS || 2 * 60 * 60 * 1000,
  );

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTimeMs };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.otpHash;
  delete obj.otpExpires;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.otpAttempts;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
