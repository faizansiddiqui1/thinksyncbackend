// src/models/paymentGateway.model.js
import mongoose from 'mongoose';

const PaymentGatewaySchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  gateway: { type: String, required: true, enum: ['cashfree', 'razorpay'] },
  credentials: { type: mongoose.Schema.Types.Mixed, required: true }, // encrypted values
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.models.PaymentGateway || mongoose.model('PaymentGateway', PaymentGatewaySchema);