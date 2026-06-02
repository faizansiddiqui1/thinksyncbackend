import mongoose from "mongoose";

const { Schema } = mongoose;

const assignmentSnapshotSchema = new Schema(
  {
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: "SecurityDevice",
      default: null,
    },
    deviceName: {
      type: String,
      default: "",
    },
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      default: null,
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
    },
    floorLabel: {
      type: String,
      default: "",
    },
    entryGate: {
      type: String,
      default: "",
    },
    workspaceLabel: {
      type: String,
      default: "",
    },
    meetingRoomLabel: {
      type: String,
      default: "",
    },
    bookingTypes: {
      type: [String],
      default: [],
    },
    accessMethods: {
      type: [String],
      default: [],
    },
    accessWindow: {
      beforeStartMinutes: {
        type: Number,
        default: 15,
      },
      afterEndMinutes: {
        type: Number,
        default: 15,
      },
    },
  },
  { _id: true },
);

const qrCredentialSchema = new Schema(
  {
    publicId: {
      type: String,
      required: true,
    },
    secretHash: {
      type: String,
      required: true,
    },
    encryptedPayload: {
      type: String,
      required: true,
    },
    dataUri: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    regeneratedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const rfidCardSchema = new Schema(
  {
    cardNoHash: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: "",
    },
    providerCardRef: {
      type: String,
      default: "",
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const biometricBindingSchema = new Schema(
  {
    method: {
      type: String,
      enum: ["fingerprint", "face"],
      required: true,
    },
    subjectRef: {
      type: String,
      required: true,
    },
    deviceIdentifier: {
      type: String,
      default: "",
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const bookingAccessCredentialSchema = new Schema(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    adminProfileId: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
      default: null,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    companyNameSnapshot: {
      type: String,
      default: "",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },
    resourceIds: {
      type: [Schema.Types.ObjectId],
      ref: "Resource",
      default: [],
    },
    accessId: {
      type: String,
      required: true,
      trim: true,
    },
    deviceIds: {
      type: [Schema.Types.ObjectId],
      ref: "SecurityDevice",
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "revoked"],
      default: "active",
      index: true,
    },
    accessMethods: {
      type: [String],
      default: ["qr"],
    },
    primaryMethod: {
      type: String,
      enum: ["qr", "rfid", "fingerprint", "face"],
      default: "qr",
    },
    validity: {
      startsAt: {
        type: Date,
        required: true,
      },
      endsAt: {
        type: Date,
        required: true,
      },
      timezone: {
        type: String,
        default: "Asia/Kolkata",
      },
      earlyAccessMinutes: {
        type: Number,
        default: 15,
      },
      lateAccessMinutes: {
        type: Number,
        default: 15,
      },
    },
    qr: {
      type: qrCredentialSchema,
      default: undefined,
    },
    rfidCards: {
      type: [rfidCardSchema],
      default: [],
    },
    biometricBindings: {
      type: [biometricBindingSchema],
      default: [],
    },
    assignmentSnapshot: {
      type: [assignmentSnapshotSchema],
      default: [],
    },
    permissions: {
      entryPermissions: {
        type: [String],
        default: [],
      },
      accessTimingLabel: {
        type: String,
        default: "",
      },
      regenerateCount: {
        type: Number,
        default: 0,
      },
      allowReusableScan: {
        type: Boolean,
        default: true,
      },
      throttleSeconds: {
        type: Number,
        default: 30,
      },
    },
    stats: {
      totalGranted: {
        type: Number,
        default: 0,
      },
      totalDenied: {
        type: Number,
        default: 0,
      },
    },
    lastValidationAt: {
      type: Date,
      default: null,
    },
    lastGrantAt: {
      type: Date,
      default: null,
    },
    lastDenyAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

bookingAccessCredentialSchema.index({ userId: 1, status: 1, createdAt: -1 });
bookingAccessCredentialSchema.index({ ownerUserId: 1, companyId: 1, status: 1 });
bookingAccessCredentialSchema.index({ accessId: 1 }, { unique: true, sparse: true });
bookingAccessCredentialSchema.index({ "qr.publicId": 1 }, { unique: true, sparse: true });

export default mongoose.model(
  "BookingAccessCredential",
  bookingAccessCredentialSchema,
);
