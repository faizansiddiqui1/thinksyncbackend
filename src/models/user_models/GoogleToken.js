import mongoose from "mongoose";

const { Schema } = mongoose;

const googleTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    accessToken: {
      type: String,
    },

    refreshToken: {
      type: String,
    },

    scope: String,
    tokenType: String,
    expiryDate: Date,
  },
  { timestamps: true },
);

export default mongoose.model("GoogleToken", googleTokenSchema);
