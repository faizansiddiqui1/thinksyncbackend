export const PLATFORM_CONFIG_CATEGORY_META = {
  payment: {
    label: "Payment Gateways",
    description: "Runtime credentials and defaults for implemented payment gateways.",
  },
  webhooks: {
    label: "Webhooks",
    description: "Provider callback endpoints and signing secrets used by implemented webhook flows.",
  },
  authentication: {
    label: "Authentication",
    description: "JWT signing secrets and token lifetime controls.",
  },
  security: {
    label: "Security Policies",
    description: "OTP and request-limiting controls enforced by the backend.",
  },
  notifications: {
    label: "Notifications",
    description: "SMTP and MSG91 delivery settings used by platform messages.",
  },
  aws: {
    label: "AWS Storage",
    description: "AWS S3 credentials and region settings used by platform uploads.",
  },
  maps: {
    label: "Maps & Location",
    description: "Google Maps and location resolution settings.",
  },
};

const createDefinition = (definition) => ({
  options: [],
  pageGroups: ["platform"],
  defaultValue: null,
  ...definition,
  isSensitive: Boolean(definition.isSensitive || definition.sensitive),
});

export const PLATFORM_CONFIG_CATALOG = [
  createDefinition({
    key: "DEFAULT_PAYMENT_GATEWAY",
    category: "payment",
    label: "Default Payment Gateway",
    description: "Select the marketplace payment gateway used when tenant-specific overrides are not active.",
    type: "string",
    options: ["cashfree", "razorpay"],
    defaultValue: "cashfree",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_CLIENT_ID",
    envKeys: ["CASHFREE_CLIENT_ID", "CASHFREE_APP_ID"],
    category: "payment",
    label: "Cashfree Client ID",
    description: "Primary Cashfree client identifier used for marketplace payments.",
    type: "string",
    sensitive: true,
    pageGroups: ["payment", "credentials", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_CLIENT_SECRET",
    envKeys: ["CASHFREE_CLIENT_SECRET", "CASHFREE_SECRET"],
    category: "payment",
    label: "Cashfree Client Secret",
    description: "Cashfree secret used to create and verify marketplace payment orders.",
    type: "string",
    sensitive: true,
    pageGroups: ["payment", "credentials", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_ENV",
    category: "payment",
    label: "Cashfree Environment",
    description: "Controls whether marketplace Cashfree transactions use sandbox or production.",
    type: "string",
    options: ["sandbox", "production", "prod"],
    defaultValue: "sandbox",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_WEBHOOK_ENDPOINT",
    category: "webhooks",
    label: "Cashfree Webhook Endpoint",
    description: "Backend callback path to register in the Cashfree dashboard for payment events.",
    type: "string",
    defaultValue: "/api/payments/cashfree/webhook",
    isReadOnly: true,
    pageGroups: ["webhooks", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_RETURN_URL",
    category: "payment",
    label: "Cashfree Return URL",
    description: "HTTPS URL used by Cashfree for order completion redirects.",
    type: "string",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_API_VERSION",
    category: "payment",
    label: "Cashfree API Version",
    description: "Version header sent to Cashfree APIs.",
    type: "string",
    defaultValue: "2025-01-01",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_BASE_URL_PROD",
    category: "payment",
    label: "Cashfree Production Base URL",
    description: "Base URL used for production Cashfree API calls.",
    type: "string",
    defaultValue: "https://api.cashfree.com",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "CASHFREE_BASE_URL_TEST",
    category: "payment",
    label: "Cashfree Sandbox Base URL",
    description: "Base URL used for sandbox Cashfree API calls.",
    type: "string",
    defaultValue: "https://sandbox.cashfree.com",
    pageGroups: ["payment", "platform"],
  }),
  createDefinition({
    key: "RAZORPAY_KEY_ID",
    category: "payment",
    label: "Razorpay Key ID",
    description: "Marketplace Razorpay key identifier.",
    type: "string",
    sensitive: true,
    pageGroups: ["payment", "credentials", "platform"],
  }),
  createDefinition({
    key: "RAZORPAY_SECRET",
    category: "payment",
    label: "Razorpay Secret",
    description: "Marketplace Razorpay secret.",
    type: "string",
    sensitive: true,
    pageGroups: ["payment", "credentials", "platform"],
  }),
  createDefinition({
    key: "RAZORPAY_WEBHOOK_SECRET",
    category: "webhooks",
    label: "Razorpay Webhook Secret",
    description: "Secret used for Razorpay webhook verification.",
    type: "string",
    sensitive: true,
    pageGroups: ["webhooks", "credentials", "platform"],
  }),
  createDefinition({
    key: "JWT_ACCESS_SECRET",
    category: "authentication",
    label: "JWT Access Secret",
    description: "Secret used to sign short-lived access tokens.",
    type: "string",
    sensitive: true,
    pageGroups: ["authentication", "credentials", "platform"],
  }),
  createDefinition({
    key: "JWT_REFRESH_SECRET",
    category: "authentication",
    label: "JWT Refresh Secret",
    description: "Secret used to sign refresh tokens.",
    type: "string",
    sensitive: true,
    pageGroups: ["authentication", "credentials", "platform"],
  }),
  createDefinition({
    key: "JWT_ACCESS_EXPIRY",
    category: "authentication",
    label: "JWT Access Expiry",
    description: "Access token lifetime, for example 60m or 15m.",
    type: "string",
    defaultValue: "60m",
    pageGroups: ["authentication", "platform"],
  }),
  createDefinition({
    key: "JWT_REFRESH_EXPIRY",
    category: "authentication",
    label: "JWT Refresh Expiry",
    description: "Refresh token lifetime, for example 7d or 30d.",
    type: "string",
    defaultValue: "7d",
    pageGroups: ["authentication", "platform"],
  }),
  createDefinition({
    key: "OTP_EXPIRY_MINUTES",
    category: "security",
    label: "OTP Expiry Minutes",
    description: "How long one-time passwords remain valid.",
    type: "number",
    defaultValue: 10,
    pageGroups: ["security", "platform"],
  }),
  createDefinition({
    key: "OTP_MAX_RETRIES",
    category: "security",
    label: "OTP Max Retries",
    description: "Maximum invalid OTP attempts before account lock logic is triggered.",
    type: "number",
    defaultValue: 3,
    pageGroups: ["security", "platform"],
  }),
  createDefinition({
    key: "OTP_RATE_LIMIT_MAX",
    category: "security",
    label: "OTP Rate Limit Max",
    description: "Maximum OTP requests allowed within the configured rate limit window.",
    type: "number",
    defaultValue: 5,
    pageGroups: ["security", "platform"],
  }),
  createDefinition({
    key: "RATE_LIMIT_MAX_REQUESTS",
    category: "security",
    label: "Rate Limit Max Requests",
    description: "Maximum requests permitted inside the current rate limit window.",
    type: "number",
    defaultValue: 100,
    pageGroups: ["security", "platform"],
  }),
  createDefinition({
    key: "RATE_LIMIT_WINDOW_MS",
    category: "security",
    label: "Rate Limit Window (ms)",
    description: "Window size in milliseconds used by general and OTP rate limiting.",
    type: "number",
    defaultValue: 900000,
    pageGroups: ["security", "platform"],
  }),
  createDefinition({
    key: "DEFAULT_SMTP_HOST",
    category: "notifications",
    label: "SMTP Host",
    description: "Default outbound SMTP host for platform emails.",
    type: "string",
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "DEFAULT_SMTP_PORT",
    category: "notifications",
    label: "SMTP Port",
    description: "Default outbound SMTP port.",
    type: "number",
    defaultValue: 587,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "DEFAULT_SMTP_USER",
    category: "notifications",
    label: "SMTP Username",
    description: "Default SMTP username used for platform emails.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "DEFAULT_SMTP_PASS",
    category: "notifications",
    label: "SMTP Password",
    description: "Default SMTP password or app password used for platform emails.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "DEFAULT_FROM_NAME",
    category: "notifications",
    label: "Default Sender Name",
    description: "Display name used in default platform emails.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "DEFAULT_FROM_EMAIL",
    category: "notifications",
    label: "Default Sender Email",
    description: "From address used in default platform emails.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "MSG91_AUTH_KEY",
    category: "notifications",
    label: "MSG91 Auth Key",
    description: "MSG91 API auth key.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "MSG91_SENDER_ID",
    category: "notifications",
    label: "MSG91 Sender ID",
    description: "Sender ID used for MSG91 messages.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "MSG91_ROUTE",
    category: "notifications",
    label: "MSG91 Route",
    description: "Route value sent to MSG91 APIs.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "MSG91_COUNTRY",
    category: "notifications",
    label: "MSG91 Country Code",
    description: "Country code used when building MSG91 OTP numbers.",
    type: "string",
    defaultValue: "91",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "MSG91_OTP_TEMPLATE_ID",
    category: "notifications",
    label: "MSG91 OTP Template ID",
    description: "Template ID used for MSG91 OTP delivery.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "AWS_ACCESS_KEY_ID",
    category: "aws",
    label: "AWS Access Key ID",
    description: "Access key used for S3 object storage operations.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "AWS_SECRET_ACCESS_KEY",
    category: "aws",
    label: "AWS Secret Access Key",
    description: "Secret access key used for S3 object storage operations.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "AWS_REGION",
    category: "aws",
    label: "AWS Region",
    description: "AWS region where platform objects are stored.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "AWS_BUCKET_NAME",
    category: "aws",
    label: "AWS Bucket Name",
    description: "Bucket name used for platform uploads.",
    type: "string",
    pageGroups: ["platform"],
  }),
  createDefinition({
    key: "GOOGLE_API_KEY",
    category: "maps",
    label: "Google API Key",
    description: "Google Maps API key used for geocoding and place search.",
    type: "string",
    sensitive: true,
    pageGroups: ["platform", "credentials"],
  }),
  createDefinition({
    key: "PLACES_COMPONENTS",
    category: "maps",
    label: "Places Components",
    description: "Google Places components filter, for example country:IN.",
    type: "string",
    defaultValue: "country:IN",
    pageGroups: ["platform"],
  }),
];

const configMap = new Map(
  PLATFORM_CONFIG_CATALOG.map((definition) => [definition.key, definition]),
);

export function getPlatformConfigDefinition(key) {
  return configMap.get(String(key || "").trim()) || null;
}

export function listPlatformConfigDefinitions({ scope = "all", search = "" } = {}) {
  const normalizedScope = String(scope || "all").trim().toLowerCase();
  const normalizedSearch = String(search || "").trim().toLowerCase();

  return PLATFORM_CONFIG_CATALOG.filter((definition) => {
    const matchesScope =
      normalizedScope === "all" ||
      normalizedScope === "platform" ||
      definition.pageGroups.includes(normalizedScope) ||
      definition.category === normalizedScope;

    if (!matchesScope) return false;

    if (!normalizedSearch) return true;

    return [
      definition.key,
      definition.label,
      definition.description,
      definition.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });
}
