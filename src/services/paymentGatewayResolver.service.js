// src/services/paymentGatewayResolver.service.js

import PaymentGateway from "../models/admin_models/paymentGateway.model.js";
import { decrypt } from "../utils/crypto.util.js";

function getPlatformGateway() {
  const gateway = process.env.DEFAULT_PAYMENT_GATEWAY || "cashfree";

  if (gateway === "razorpay") {
    return {
      source: "platform",
      gateway: "razorpay",
      credentials: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_SECRET,
      },
    };
  }

  return {
    source: "platform",
    gateway: "cashfree",
    credentials: {
      appId: process.env.CASHFREE_APP_ID,
      secret: process.env.CASHFREE_SECRET,
      env: process.env.CASHFREE_ENV || "sandbox",
    },
  };
}

export async function resolveGateway(tenantId) {
  // ✅ NO TENANT → platform
  if (!tenantId) {
    return getPlatformGateway();
  }

  const record = await PaymentGateway.findOne({
    tenantId,
    active: true,
  }).lean();

  // ❌ no tenant config → fallback platform
  if (!record) {
    return getPlatformGateway();
  }

  // 🔐 decrypt creds
  const creds = {};
  for (const [k, v] of Object.entries(record.credentials || {})) {
    try {
      creds[k] =
        typeof v === "string" && v.startsWith("enc:")
          ? decrypt(v.slice(4))
          : v;
    } catch {
      creds[k] = v;
    }
  }

  return {
    source: "tenant",
    gateway: record.gateway, // razorpay OR cashfree
    credentials: creds,
  };
}