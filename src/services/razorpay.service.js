// src/services/razorpay.service.js
// scaffold for later full implementation
import Razorpay from 'razorpay';
import crypto from "crypto"

export function createRazorpayInstance(credentials) {
  return new Razorpay({
    key_id: credentials.keyId || process.env.RAZORPAY_KEY_ID,
    key_secret: credentials.keySecret || process.env.RAZORPAY_SECRET
  });
}

export async function createRazorpayOrder({ instance, amount, currency = 'INR', receipt }) {
  const options = {
    amount: Math.round(amount * 100), // paise
    currency,
    receipt: receipt || `rcpt_${Date.now()}`
  };
  return instance.orders.create(options);
}

export function verifyRazorpayWebhook({ bodyRaw, signature, secret }) {
  const expected = crypto.createHmac('sha256', secret).update(bodyRaw).digest('hex');
  return expected === signature;
}