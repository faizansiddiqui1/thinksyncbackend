import AdminProfile from "../models/admin_models/AdminProfile.js";
import TenantSecrets from "../models/admin_models/TenantSecrets.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

/**
 * Platform-level credentials
 */
async function getPlatformCredentials() {
  const values = await getPlatformConfigValues([
    "CASHFREE_CLIENT_ID",
    "CASHFREE_CLIENT_SECRET",
    "CASHFREE_ENV",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "DEFAULT_SMTP_HOST",
    "DEFAULT_SMTP_PORT",
    "DEFAULT_SMTP_USER",
    "DEFAULT_SMTP_PASS",
    "DEFAULT_FROM_NAME",
    "DEFAULT_FROM_EMAIL",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
    "AWS_BUCKET_NAME",
    "GOOGLE_API_KEY",
    "PLACES_COMPONENTS",
    "MSG91_AUTH_KEY",
    "MSG91_SENDER_ID",
    "MSG91_ROUTE",
    "MSG91_COUNTRY",
    "MSG91_OTP_TEMPLATE_ID",
  ]);

  return {
    cashfree: {
      clientId: values.CASHFREE_CLIENT_ID || "",
      clientSecret: values.CASHFREE_CLIENT_SECRET || "",
      env: values.CASHFREE_ENV || "sandbox",
      publicKeyPath: process.env.CASHFREE_PUBLIC_KEY_PATH,
    },

    razorpay: {
      keyId: values.RAZORPAY_KEY_ID || "",
      keySecret: values.RAZORPAY_SECRET || "",
      webhookSecret: values.RAZORPAY_WEBHOOK_SECRET || "",
    },

    smtp: {
      host: values.DEFAULT_SMTP_HOST || "",
      port: values.DEFAULT_SMTP_PORT || 587,
      username: values.DEFAULT_SMTP_USER || "",
      password: values.DEFAULT_SMTP_PASS || "",
      fromName: values.DEFAULT_FROM_NAME || "",
      fromEmail: values.DEFAULT_FROM_EMAIL || "",
    },

    aws: {
      accessKeyId: values.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: values.AWS_SECRET_ACCESS_KEY || "",
      region: values.AWS_REGION || "",
      bucketName: values.AWS_BUCKET_NAME || "",
    },

    google: {
      apiKey: values.GOOGLE_API_KEY || "",
      placesComponents: values.PLACES_COMPONENTS || "country:IN",
    },

    msg91: {
      authKey: values.MSG91_AUTH_KEY || "",
      senderId: values.MSG91_SENDER_ID || "",
      route: values.MSG91_ROUTE || "",
      country: values.MSG91_COUNTRY || "91",
      templateId: values.MSG91_OTP_TEMPLATE_ID || "",
    },
  };
}

/**
 * Get tenant-specific secrets
 */
function getSecretFromDoc(secrets, type) {
  if (!secrets) return null;
  return secrets[type] || null;
}

/**
 * STRICT SaaS credential resolver
 */
export const getCredentials = async (req, type) => {
  if (!type) {
    throw new Error("Credential type is required");
  }

  const platform = await getPlatformCredentials();
  const platformCreds = platform[type];

  if (!platformCreds) {
    throw new Error(`Unsupported credential type: ${type}`);
  }

  const tenant = req?.tenant;

  // ✅ No tenant → platform allowed
  if (!tenant) return platformCreds;

  const admin = await AdminProfile.findById(tenant.adminProfileId)
    .select("whiteLabel")
    .lean();

  // ❌ NOT APPROVED → NO ACCESS AT ALL
  if (!admin?.whiteLabel || admin.whiteLabel.status !== "approved") {
    throw new Error("Tenant not approved. No credential access allowed.");
  }

  // ✅ Approved + using platform
  if (admin.whiteLabel.usePlatformCredentials === true) {
    return platformCreds;
  }

  // ✅ Approved + MUST use own credentials
  const secrets = await TenantSecrets.findOne({
    tenantId: tenant._id,
  }).lean();

  if (!secrets) {
    throw new Error("Tenant credentials not found. Please upload credentials.");
  }

  const tenantCreds = getSecretFromDoc(secrets, type);

  if (!tenantCreds) {
    throw new Error(
      `Tenant ${type} credentials missing. Platform usage is disabled.`
    );
  }

  return tenantCreds;
};
