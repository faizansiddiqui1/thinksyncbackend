import mongoose from "mongoose";

const { Schema } = mongoose;

const outlookTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    accessToken: {
      type: String,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    scope: String,
    tokenType: String,
    expiresAt: Date,
    outlookEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    microsoftUserId: String,
    lastTokenRefreshAt: Date,
    lastSyncTime: Date,
  },
  { timestamps: true },
);

export default mongoose.model("OutlookToken", outlookTokenSchema);
