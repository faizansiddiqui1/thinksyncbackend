import PaymentGateway from "../models/admin_models/paymentGateway.model.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import Tenant from "../models/admin_models/tenant.model.js";
import { decrypt } from "../utils/crypto.util.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

async function getPlatformGateway() {
  const values = await getPlatformConfigValues([
    "DEFAULT_PAYMENT_GATEWAY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_SECRET",
    "CASHFREE_CLIENT_ID",
    "CASHFREE_CLIENT_SECRET",
    "CASHFREE_ENV",
  ]);
  const gateway = values.DEFAULT_PAYMENT_GATEWAY || "cashfree";

  if (gateway === "razorpay") {
    return {
      source: "platform",
      gateway: "razorpay",
      credentials: {
        keyId: values.RAZORPAY_KEY_ID || "",
        keySecret: values.RAZORPAY_SECRET || "",
      },
    };
  }

  return {
    source: "platform",
    gateway: "cashfree",
    credentials: {
      appId: values.CASHFREE_CLIENT_ID || "",
      secret: values.CASHFREE_CLIENT_SECRET || "",
      env: values.CASHFREE_ENV || "sandbox",
    },
  };
}

export async function resolveGateway(ownerId) {
  if (!ownerId) return getPlatformGateway();

  const adminProfile = await AdminProfile.findOne({ owner: ownerId }).lean();
  if (!adminProfile || adminProfile.whiteLabel?.status !== "approved") {
    return getPlatformGateway();
  }

  const request = adminProfile.whiteLabel?.request || {};

  // Only when paymentMode is own_gateway use tenant gateway
  if (request.paymentMode !== "own_gateway") {
    return getPlatformGateway();
  }

  const tenant = await Tenant.findOne({ ownerId }).select("_id").lean();
  if (!tenant) return getPlatformGateway();

  const record = await PaymentGateway.findOne({
    tenantId: tenant._id,
    active: true,
  }).lean();

  if (!record) return getPlatformGateway();

  const creds = {};
  for (const [k, v] of Object.entries(record.credentials || {})) {
    creds[k] =
      typeof v === "string" && v.startsWith("enc:")
        ? decrypt(v.slice(4))
        : v;
  }

  return {
    source: "tenant",
    gateway: record.gateway,
    credentials: creds,
  };
}
