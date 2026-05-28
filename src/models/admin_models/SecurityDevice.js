import mongoose from "mongoose";

const { Schema } = mongoose;

const assignmentSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
    },
    floorLabel: {
      type: String,
      trim: true,
      default: "",
    },
    entryGate: {
      type: String,
      trim: true,
      default: "",
    },
    workspaceLabel: {
      type: String,
      trim: true,
      default: "",
    },
    meetingRoomLabel: {
      type: String,
      trim: true,
      default: "",
    },
    bookingTypes: {
      type: [String],
      default: ["hourly", "daily", "weekly", "monthly"],
    },
    accessMethods: {
      type: [String],
      default: ["qr"],
    },
    accessWindow: {
      beforeStartMinutes: {
        type: Number,
        default: 15,
        min: 0,
      },
      afterEndMinutes: {
        type: Number,
        default: 15,
        min: 0,
      },
    },
    bookingAccessEnabled: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true },
);

const connectionStatusSchema = new Schema(
  {
    state: {
      type: String,
      enum: [
        "not_configured",
        "validating",
        "connected",
        "failed",
        "suspended",
        "disabled",
      ],
      default: "not_configured",
    },
    online: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      default: "",
    },
    statusCode: {
      type: Number,
      default: null,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const syncConfigurationSchema = new Schema(
  {
    healthcheckPath: {
      type: String,
      default: "",
    },
    personSyncPath: {
      type: String,
      default: "",
    },
    cardSyncPath: {
      type: String,
      default: "",
    },
    accessEventPath: {
      type: String,
      default: "",
    },
    remoteCheckPath: {
      type: String,
      default: "",
    },
    openDoorPath: {
      type: String,
      default: "",
    },
    autoSyncEnabled: {
      type: Boolean,
      default: true,
    },
    autoSyncIntervalMinutes: {
      type: Number,
      default: 15,
      min: 1,
    },
  },
  { _id: false },
);

const lastErrorSchema = new Schema(
  {
    code: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    occurredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const securityDeviceSchema = new Schema(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adminProfileId: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
      default: null,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      enum: ["hikvision", "zkteco"],
      required: true,
      index: true,
    },
    providerKey: {
      type: String,
      required: true,
      trim: true,
    },
    deviceType: {
      type: String,
      required: true,
      trim: true,
    },
    authMethod: {
      type: String,
      required: true,
      trim: true,
    },
    apiEndpoint: {
      type: String,
      default: "",
      trim: true,
    },
    deviceIp: {
      type: String,
      default: "",
      trim: true,
    },
    port: {
      type: Number,
      default: null,
    },
    protocol: {
      type: String,
      enum: ["http", "https"],
      default: "http",
    },
    deviceIdentifier: {
      type: String,
      default: "",
      trim: true,
    },
    credentials: {
      type: Schema.Types.Mixed,
      default: {},
    },
    enabledAccessMethods: {
      type: [String],
      default: ["qr"],
    },
    bookingAccessEnabled: {
      type: Boolean,
      default: true,
    },
    approvalStatus: {
      type: String,
      enum: ["pending_review", "approved", "suspended", "disabled"],
      default: "pending_review",
      index: true,
    },
    connectionStatus: {
      type: connectionStatusSchema,
      default: () => ({}),
    },
    syncConfiguration: {
      type: syncConfigurationSchema,
      default: () => ({}),
    },
    assignments: {
      type: [assignmentSchema],
      default: [],
    },
    metrics: {
      syncCount: {
        type: Number,
        default: 0,
      },
      accessGrantedCount: {
        type: Number,
        default: 0,
      },
      accessDeniedCount: {
        type: Number,
        default: 0,
      },
      failedSyncAttempts: {
        type: Number,
        default: 0,
      },
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
    lastAccessAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: lastErrorSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

securityDeviceSchema.index({ ownerUserId: 1, brand: 1, approvalStatus: 1 });
securityDeviceSchema.index({ tenantId: 1, companyId: 1 });
securityDeviceSchema.index({ "assignments.space": 1 });
securityDeviceSchema.index({ deviceIdentifier: 1, ownerUserId: 1 });

export default mongoose.model("SecurityDevice", securityDeviceSchema);
