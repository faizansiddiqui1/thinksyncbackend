// src/services/cashfree.service.js
import crypto from "crypto";
import axios from "axios";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

export async function createCashfreeOrder({
  credentials,
  orderId,
  amount,  
  currency = "INR",
  customer = {},
}) {
  if (!credentials?.appId || !credentials?.secret)
    throw new Error("Missing Cashfree credentials");

  const runtimeConfig = await getPlatformConfigValues([
    "CASHFREE_ENV",
    "CASHFREE_BASE_URL_PROD",
    "CASHFREE_BASE_URL_TEST",
    "CASHFREE_RETURN_URL",
    "CASHFREE_API_VERSION",
  ]);
  const env = credentials.env || runtimeConfig.CASHFREE_ENV || "sandbox";
  const base =
    env === "prod" || env === "production"
      ? runtimeConfig.CASHFREE_BASE_URL_PROD
      : runtimeConfig.CASHFREE_BASE_URL_TEST;

  const body = {
    order_id: String(orderId),
    order_amount: Number(amount),
    order_currency: currency,
    customer_details: {
      customer_id: `cust_${Date.now()}`,
      customer_name: (customer.name || "").trim() || "Test User",
      customer_email: (customer.email || "").trim() || "test@example.com",
      customer_phone: (customer.phone || "").trim() || "9999999999",
    },
    order_meta: {
      // IMPORTANT: for local dev set null; for production use a https:// return url
      return_url:
        runtimeConfig.CASHFREE_RETURN_URL &&
        String(runtimeConfig.CASHFREE_RETURN_URL).startsWith("https://")
          ? runtimeConfig.CASHFREE_RETURN_URL
          : null,
    },
  };

  const headers = {
    "Content-Type": "application/json",
    "x-client-id": credentials.appId,
    "x-client-secret": credentials.secret,
    "x-api-version": runtimeConfig.CASHFREE_API_VERSION || "2025-01-01",
  };

  try {
    const res = await axios.post(`${base}/pg/orders`, body, { headers });
    const data = res.data;
    if (!data?.payment_session_id)
      throw new Error("payment_session_id not received from Cashfree");
    return {
      orderId: data.order_id,
      payment_session_id: data.payment_session_id,
      raw: data,
    };
  } catch (err) {
    const resp = err?.response?.data || err?.message || err;
    console.error("Cashfree create order failed:", resp);
    throw new Error(resp?.message || JSON.stringify(resp));
  }
}

export function verifyCashfreeWebhook({
  bodyRaw,
  signature,
  timestamp,
  secret,
}) {
  if (!signature || !timestamp || !secret) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}${String(bodyRaw)}`)
    .digest("base64");
  const actualBuffer = Buffer.from(String(signature));
  const computedBuffer = Buffer.from(computed);

  return (
    actualBuffer.length === computedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, computedBuffer)
  );
}
