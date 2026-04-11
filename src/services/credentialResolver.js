import AdminProfile from "../models/admin_models/AdminProfile.js";
import TenantSecrets from "../models/admin_models/TenantSecrets.js";

export const getCredentials = async (req, type) => {
  const tenant = req.tenant;

  // 🔥 fallback = platform ENV
  const platform = {
    cashfree: {
      clientId: process.env.CASHFREE_CLIENT_ID,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET,
      env: process.env.CASHFREE_ENV,
    },
    smtp: {
      host: process.env.DEFAULT_SMTP_HOST,
      port: process.env.DEFAULT_SMTP_PORT,
      user: process.env.DEFAULT_SMTP_USER,
      pass: process.env.DEFAULT_SMTP_PASS,
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucketName: process.env.AWS_BUCKET_NAME,
    },
  };

  // ❌ no tenant → platform
  if (!tenant) return platform[type];

  // 🔥 admin profile fetch
  const admin = await AdminProfile.findById(
    tenant.adminProfileId
  ).select("whiteLabel");

  // ❌ not approved → platform
  if (admin?.whiteLabel?.status !== "approved") {
    return platform[type];
  }

  // ✅ use platform creds
  if (admin.whiteLabel.usePlatformCredentials === true) {
    return platform[type];
  }

  // 🔥 get tenant secrets
  const secrets = await TenantSecrets.findOne({
    tenantId: tenant._id,
  }).lean();

  // ❌ no secrets → fallback
  if (!secrets || !secrets[type]) {
    return platform[type];
  }

  // ✅ tenant creds
  return secrets[type];
};