// src/services/razorpay.service.js
// scaffold for later full implementation
import Razorpay from "razorpay";
import crypto from "crypto";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

export async function createRazorpayInstance(credentials) {
  const values = await getPlatformConfigValues([
    "RAZORPAY_KEY_ID",
    "RAZORPAY_SECRET",
  ]);

  return new Razorpay({
    key_id: credentials.keyId || values.RAZORPAY_KEY_ID,
    key_secret: credentials.keySecret || values.RAZORPAY_SECRET,
  });
}

export async function createRazorpayOrder({
  instance,
  amount,
  currency = "INR",
  receipt,
}) {
  const options = {
    amount: Math.round(amount * 100), // paise
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
  };
  return instance.orders.create(options);
}

export function verifyRazorpayWebhook({ bodyRaw, signature, secret }) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(bodyRaw)
    .digest("hex");
  return expected === signature;
}
