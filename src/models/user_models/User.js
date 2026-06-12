// models/User.js
import bcrypt from "bcryptjs";
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

const PasswordResetSchema = new Schema(
  {
    channel: {
      type: String,
      enum: ["email", "phone"],
      default: null,
    },
    target: {
      type: String,
      trim: true,
      default: "",
    },
    otpHash: {
      type: String,
      default: "",
      select: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    allowUntil: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const BackupCodeSchema = new Schema(
  {
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const TwoFactorSchema = new Schema(
  {
    secretEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    pendingSecretEncrypted: {
      type: String,
      default: "",
      select: false,
    },
    pendingSecretCreatedAt: {
      type: Date,
      default: null,
    },
    enabledAt: {
      type: Date,
      default: null,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    backupCodes: {
      type: [BackupCodeSchema],
      default: [],
      select: false,
    },
  },
  { _id: false },
);

const TrustedDeviceSchema = new Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    label: {
      type: String,
      trim: true,
      default: "",
    },
    browser: {
      type: String,
      trim: true,
      default: "",
    },
    os: {
      type: String,
      trim: true,
      default: "",
    },
    ip: {
      type: String,
      trim: true,
      default: "",
    },
    userAgent: {
      type: String,
      trim: true,
      default: "",
    },
    trustedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: false },
);

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
    faceMatch: {
      raw: Schema.Types.Mixed,
      matched: { type: Boolean, default: false },
      score: Number,
      processedAt: Date,
      error: String,
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

    pendingRecoveryEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    pendingRecoveryEmailRequestedAt: Date,

    pendingRecoveryPhone: {
      type: String,
      trim: true,
      default: "",
    },
    pendingRecoveryPhoneRequestedAt: Date,

    recoveryEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
      validate: {
        validator: function (v) {
          return !v || /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
        },
        message: "Please provide a valid recovery email address",
      },
    },

    recoveryPhone: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (v) {
          return !v || /^\+?[\d\s\-()]+$/.test(v);
        },
        message: "Please provide a valid recovery phone number",
      },
    },

    recoveryEmailVerified: {
      type: Boolean,
      default: false,
    },

    recoveryPhoneVerified: {
      type: Boolean,
      default: false,
    },

    password: {
      type: String,
      select: false, // hide by default
    },

    phoneVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    securityPreferences: {
      emailLoginEnabled: {
        type: Boolean,
        default: true,
      },
      phoneLoginEnabled: {
        type: Boolean,
        default: true,
      },
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      twoFactorMethod: {
        type: String,
        enum: ["none", "totp", "otp"],
        default: "none",
      },
      lastSecurityReviewAt: {
        type: Date,
        default: null,
      },
    },
    passwordReset: {
      type: PasswordResetSchema,
      default: () => ({}),
    },
    twoFactor: {
      type: TwoFactorSchema,
      default: () => ({}),
    },
    trustedDevices: {
      type: [TrustedDeviceSchema],
      default: [],
      select: false,
    },
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

    outlookConnected: {
      type: Boolean,
      default: false,
      index: true,
    },

    outlookAccessToken: {
      type: String,
      select: false,
    },

    outlookRefreshToken: {
      type: String,
      select: false,
    },

    outlookEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },

    calendarProvider: {
      type: String,
      enum: ["google", "outlook", "multiple", null],
      default: null,
      index: true,
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

userSchema.pre("save", async function (next) {
  try {
    if (this.email) this.email = this.email.trim().toLowerCase();
    if (this.recoveryEmail) this.recoveryEmail = this.recoveryEmail.trim().toLowerCase();
    if (this.pendingRecoveryEmail) {
      this.pendingRecoveryEmail = this.pendingRecoveryEmail.trim().toLowerCase();
    }

    if (!this.isModified("password") || !this.password) {
      return next();
    }

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = function (candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return bcrypt.compare(String(candidatePassword), this.password);
};

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
  delete obj.passwordReset;
  delete obj.twoFactor;
  delete obj.trustedDevices;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
