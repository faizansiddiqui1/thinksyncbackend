const COMMON_ACCESS_METHODS = ["qr", "rfid", "fingerprint", "face"];
const COMMON_BOOKING_TYPES = ["hourly", "daily", "weekly", "monthly"];

const HIKVISION_DOCS = [
  {
    label: "Hikvision Open Capabilities",
    url: "https://tpp.hikvision.com/tpp/OpenCapabilities",
  },
  {
    label: "Hikvision Access Control ISAPI",
    url: "https://open.hikvision.com/hardware/v2/08%E5%8D%8F%E8%AE%AE%E9%80%8F%E4%BC%A0/%E6%98%8E%E7%9C%B8%E9%97%A8%E7%A6%81.html",
  },
];

const ZKTECO_DOCS = [
  {
    label: "ZKBio CVSecurity",
    url: "https://www.zkteco.com/en/ZKBio_CVSecurity/ZKBio_CVSecurity",
  },
  {
    label: "ZKBio CVSecurity API",
    url: "https://zkteco.com/en/ZKBio_CVSecurity_API/ZKBioCVSecurity_API",
  },
];

export const SECURITY_PROVIDER_CATALOG = [
  {
    brand: "hikvision",
    label: "Hikvision",
    providerKey: "hikvision_isapi_access_control",
    docs: HIKVISION_DOCS,
    description:
      "Direct access control integration over Hikvision ISAPI for access controllers, face terminals, and gates.",
    supportedAccessMethods: COMMON_ACCESS_METHODS,
    supportedDeviceTypes: [
      { value: "access_controller", label: "Access Controller" },
      { value: "face_terminal", label: "Face Terminal" },
      { value: "fingerprint_terminal", label: "Fingerprint Terminal" },
      { value: "rfid_reader", label: "RFID Reader" },
      { value: "qr_terminal", label: "QR Scanner" },
      { value: "turnstile", label: "Turnstile / Gate" },
    ],
    authMethods: [
      {
        value: "hikvision_isapi_digest",
        label: "ISAPI Username/Password",
        connectionPath: "/ISAPI/AccessControl/UserInfo/Count?format=json",
        requiredFields: [
          "deviceName",
          "deviceType",
          "protocol",
          "deviceIp",
          "port",
          "username",
          "password",
        ],
        optionalFields: [
          "deviceIdentifier",
          "syncConfiguration.healthcheckPath",
          "syncConfiguration.remoteCheckPath",
          "syncConfiguration.personSyncPath",
          "syncConfiguration.cardSyncPath",
          "syncConfiguration.autoSyncEnabled",
          "syncConfiguration.autoSyncIntervalMinutes",
        ],
      },
    ],
  },
  {
    brand: "zkteco",
    label: "ZKTeco",
    providerKey: "zkteco_zkbio_cvsecurity",
    docs: ZKTECO_DOCS,
    description:
      "Integration against ZKTeco ZKBio CVSecurity REST endpoints and connected access-control devices.",
    supportedAccessMethods: COMMON_ACCESS_METHODS,
    supportedDeviceTypes: [
      { value: "access_platform", label: "ZKBio Platform" },
      { value: "face_terminal", label: "Face Terminal" },
      { value: "fingerprint_terminal", label: "Fingerprint Terminal" },
      { value: "rfid_reader", label: "RFID Reader" },
      { value: "qr_terminal", label: "QR Scanner" },
      { value: "turnstile", label: "Turnstile / Gate" },
    ],
    authMethods: [
      {
        value: "zkteco_access_token",
        label: "Access Token",
        connectionPath: "/",
        requiredFields: [
          "deviceName",
          "deviceType",
          "apiEndpoint",
          "accessToken",
        ],
        optionalFields: [
          "deviceIdentifier",
          "syncConfiguration.healthcheckPath",
          "syncConfiguration.personSyncPath",
          "syncConfiguration.cardSyncPath",
          "syncConfiguration.accessEventPath",
          "syncConfiguration.autoSyncEnabled",
          "syncConfiguration.autoSyncIntervalMinutes",
        ],
      },
      {
        value: "zkteco_basic_auth",
        label: "Username/Password",
        connectionPath: "/",
        requiredFields: [
          "deviceName",
          "deviceType",
          "apiEndpoint",
          "username",
          "password",
        ],
        optionalFields: [
          "deviceIdentifier",
          "syncConfiguration.healthcheckPath",
          "syncConfiguration.personSyncPath",
          "syncConfiguration.cardSyncPath",
          "syncConfiguration.accessEventPath",
          "syncConfiguration.autoSyncEnabled",
          "syncConfiguration.autoSyncIntervalMinutes",
        ],
      },
      {
        value: "zkteco_api_key",
        label: "API Key + Secret Key",
        connectionPath: "/",
        requiredFields: [
          "deviceName",
          "deviceType",
          "apiEndpoint",
          "apiKey",
          "secretKey",
        ],
        optionalFields: [
          "deviceIdentifier",
          "syncConfiguration.healthcheckPath",
          "syncConfiguration.personSyncPath",
          "syncConfiguration.cardSyncPath",
          "syncConfiguration.accessEventPath",
          "syncConfiguration.autoSyncEnabled",
          "syncConfiguration.autoSyncIntervalMinutes",
        ],
      },
    ],
  },
];

export const SECURITY_DEVICE_FIELDS = [
  {
    key: "deviceName",
    label: "Device Name",
    type: "text",
    required: true,
  },
  {
    key: "brand",
    label: "Device Brand",
    type: "select",
    options: SECURITY_PROVIDER_CATALOG.map((provider) => ({
      value: provider.brand,
      label: provider.label,
    })),
    required: true,
  },
  {
    key: "deviceType",
    label: "Device Type",
    type: "select",
    required: true,
  },
  {
    key: "apiEndpoint",
    label: "API Endpoint",
    type: "url",
  },
  {
    key: "protocol",
    label: "Protocol",
    type: "select",
    options: [
      { value: "http", label: "HTTP" },
      { value: "https", label: "HTTPS" },
    ],
  },
  {
    key: "deviceIp",
    label: "Device IP",
    type: "text",
  },
  {
    key: "port",
    label: "Port",
    type: "number",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
  },
  {
    key: "secretKey",
    label: "Secret Key",
    type: "password",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
  },
  {
    key: "password",
    label: "Password",
    type: "password",
  },
  {
    key: "accessToken",
    label: "Access Token",
    type: "password",
  },
  {
    key: "deviceIdentifier",
    label: "Device Identifier",
    type: "text",
  },
  {
    key: "syncConfiguration.healthcheckPath",
    label: "Sync Configuration: Healthcheck Path",
    type: "text",
  },
  {
    key: "syncConfiguration.personSyncPath",
    label: "Sync Configuration: Person Sync Path",
    type: "text",
  },
  {
    key: "syncConfiguration.cardSyncPath",
    label: "Sync Configuration: Card Sync Path",
    type: "text",
  },
  {
    key: "syncConfiguration.accessEventPath",
    label: "Sync Configuration: Access Event Path",
    type: "text",
  },
  {
    key: "syncConfiguration.remoteCheckPath",
    label: "Sync Configuration: Remote Check Path",
    type: "text",
  },
  {
    key: "syncConfiguration.autoSyncEnabled",
    label: "Sync Configuration: Auto Sync Enabled",
    type: "boolean",
  },
  {
    key: "syncConfiguration.autoSyncIntervalMinutes",
    label: "Sync Configuration: Auto Sync Interval (Minutes)",
    type: "number",
  },
];

export function normalizeDeviceBrand(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function getSecurityProviderCatalog() {
  return SECURITY_PROVIDER_CATALOG.map((provider) => ({
    ...provider,
    fieldDefinitions: SECURITY_DEVICE_FIELDS,
  }));
}

export function getSecurityProviderDefinition(brand = "") {
  const normalizedBrand = normalizeDeviceBrand(brand);
  return (
    SECURITY_PROVIDER_CATALOG.find(
      (provider) => provider.brand === normalizedBrand,
    ) || null
  );
}

export function getSecurityAuthMethodDefinition(brand = "", authMethod = "") {
  const provider = getSecurityProviderDefinition(brand);
  if (!provider) return null;

  return (
    provider.authMethods.find(
      (method) => method.value === String(authMethod || "").trim(),
    ) || null
  );
}

export function getRequiredProviderFields(brand = "", authMethod = "") {
  const method = getSecurityAuthMethodDefinition(brand, authMethod);
  return method?.requiredFields || [];
}

export function getOptionalProviderFields(brand = "", authMethod = "") {
  const method = getSecurityAuthMethodDefinition(brand, authMethod);
  return method?.optionalFields || [];
}

export function getProviderSupportedAccessMethods(brand = "") {
  return getSecurityProviderDefinition(brand)?.supportedAccessMethods || [];
}

export function getProviderSupportedDeviceTypes(brand = "") {
  return getSecurityProviderDefinition(brand)?.supportedDeviceTypes || [];
}

export function buildCredentialMask(rawCredentials = {}) {
  return Object.keys(rawCredentials || {}).reduce((accumulator, key) => {
    if (rawCredentials[key] === undefined || rawCredentials[key] === null) {
      return accumulator;
    }

    accumulator[key] = {
      hasValue: String(rawCredentials[key] || "").length > 0,
    };
    return accumulator;
  }, {});
}

export function getDefaultSecurityAssignment() {
  return {
    bookingTypes: [...COMMON_BOOKING_TYPES],
    accessMethods: ["qr"],
    accessWindow: {
      beforeStartMinutes: 15,
      afterEndMinutes: 15,
    },
    bookingAccessEnabled: true,
    isActive: true,
  };
}

export function getDefaultSyncConfiguration(brand = "", authMethod = "") {
  const method = getSecurityAuthMethodDefinition(brand, authMethod);
  return {
    healthcheckPath: method?.connectionPath || "/",
    personSyncPath: "",
    cardSyncPath: "",
    accessEventPath: "",
    remoteCheckPath:
      normalizeDeviceBrand(brand) === "hikvision"
        ? "/ISAPI/AccessControl/remoteCheck?format=json"
        : "",
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 15,
  };
}
