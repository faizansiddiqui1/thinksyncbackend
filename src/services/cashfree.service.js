// src/services/cashfree.service.js
import crypto from "crypto";
import axios from "axios";

function baseUrl(env) {
  if (env === "prod" || env === "production")
    return process.env.CASHFREE_BASE_URL_PROD;
  return process.env.CASHFREE_BASE_URL_TEST;
}

export async function createCashfreeOrder({
  credentials,
  orderId,
  amount,  
  currency = "INR",
  customer = {},
}) {
  if (!credentials?.appId || !credentials?.secret)
    throw new Error("Missing Cashfree credentials");

  const env = credentials.env || process.env.CASHFREE_ENV || "sandbox";
  const base = baseUrl(env);

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
        process.env.CASHFREE_RETURN_URL &&
        process.env.CASHFREE_RETURN_URL.startsWith("https://")
          ? process.env.CASHFREE_RETURN_URL
          : null,
    },
  };

  const headers = {
    "Content-Type": "application/json",
    "x-client-id": credentials.appId,
    "x-client-secret": credentials.secret,
    "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
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

export function verifyCashfreeWebhook({ bodyRaw, signature, secret }) {
  if (!signature || !secret) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(String(bodyRaw))
    .digest("base64");
  return computed === signature;
}
