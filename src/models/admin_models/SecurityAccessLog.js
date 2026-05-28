import mongoose from "mongoose";

const { Schema } = mongoose;

const securityAccessLogSchema = new Schema(
  {
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
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    accessCredential: {
      type: Schema.Types.ObjectId,
      ref: "BookingAccessCredential",
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: "SecurityDevice",
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "device_connected",
        "device_validation_failed",
        "device_sync",
        "device_sync_failed",
        "device_status_changed",
        "qr_scan",
        "rfid_scan",
        "fingerprint_scan",
        "face_scan",
        "access_granted",
        "access_denied",
        "connection_error",
      ],
      required: true,
      index: true,
    },
    accessMethod: {
      type: String,
      enum: ["qr", "rfid", "fingerprint", "face", "system"],
      default: "system",
    },
    result: {
      type: String,
      enum: ["granted", "denied", "info", "error"],
      default: "info",
      index: true,
    },
    direction: {
      type: String,
      enum: ["entry", "exit", "unknown"],
      default: "unknown",
    },
    reasonCode: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    credentialPreview: {
      type: String,
      default: "",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

securityAccessLogSchema.index({ createdAt: -1, eventType: 1 });
securityAccessLogSchema.index({ ownerUserId: 1, createdAt: -1 });
securityAccessLogSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model("SecurityAccessLog", securityAccessLogSchema);
