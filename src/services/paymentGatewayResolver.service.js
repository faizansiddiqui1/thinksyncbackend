import PaymentGateway from "../models/admin_models/paymentGateway.model.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import Tenant from "../models/admin_models/tenant.model.js";
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