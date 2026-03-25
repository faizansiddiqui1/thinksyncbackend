
import mongoose from "mongoose";

const paymentGatewaySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // 👉 owner/admin
      required: true,
      index: true,
    },

    gateway: {
      type: String,
      enum: ["cashfree", "razorpay"],
      required: true,
    },

    credentials: {
      type: Object,
      required: true,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// one tenant → one active gateway
paymentGatewaySchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model("PaymentGateway", paymentGatewaySchema);