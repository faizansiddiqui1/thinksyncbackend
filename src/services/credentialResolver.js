import AdminProfile from "../models/admin_models/AdminProfile.js";
import TenantSecrets from "../models/admin_models/TenantSecrets.js";

/**
 * Platform-level credentials
 */
function getPlatformCredentials() {
  return {
    cashfree: {
      clientId: process.env.CASHFREE_CLIENT_ID,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET,
      env: process.env.CASHFREE_ENV,
      publicKeyPath: process.env.CASHFREE_PUBLIC_KEY_PATH,
    },

    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    },

    smtp: {
      host: process.env.DEFAULT_SMTP_HOST,
      port: process.env.DEFAULT_SMTP_PORT,
      username: process.env.DEFAULT_SMTP_USER,
      password: process.env.DEFAULT_SMTP_PASS,
      fromName: process.env.DEFAULT_FROM_NAME,
      fromEmail: process.env.DEFAULT_FROM_EMAIL,
    },

    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucketName: process.env.AWS_BUCKET_NAME,
    },

    google: {
      apiKey: process.env.GOOGLE_API_KEY,
      placesComponents: process.env.PLACES_COMPONENTS,
    },

    msg91: {
      authKey: process.env.MSG91_AUTH_KEY,
      senderId: process.env.MSG91_SENDER_ID,
      route: process.env.MSG91_ROUTE,
      country: process.env.MSG91_COUNTRY,
      templateId: process.env.MSG91_OTP_TEMPLATE_ID,
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

  const platform = getPlatformCredentials();
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