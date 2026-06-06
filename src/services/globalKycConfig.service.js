import AdminProfile from "../models/admin_models/AdminProfile.js";

export const GLOBAL_KYC_PROFILE_NAME = "GLOBAL_DEFAULT";

export const DEFAULT_GLOBAL_KYC_CONFIG = Object.freeze({
  requirePan: true,
  requireAadhaar: true,
  requireGstin: false,
  requireCin: false,
  requireCompanyPan: false,
  requireFaceMatch: false,
  requireBankCheack: false,
});

const CONFIG_KEYS = Object.keys(DEFAULT_GLOBAL_KYC_CONFIG);
const GLOBAL_QUERY = { "company.name": GLOBAL_KYC_PROFILE_NAME };

function toBoolean(value, fallback = false) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

export function normalizeGlobalKycConfig(config = {}) {
  return Object.fromEntries(
    CONFIG_KEYS.map((key) => [
      key,
      toBoolean(config?.[key], DEFAULT_GLOBAL_KYC_CONFIG[key]),
    ]),
  );
}

function sanitizeGlobalKycUpdate(update = {}) {
  return Object.fromEntries(
    CONFIG_KEYS.filter((key) => Object.hasOwn(update, key)).map((key) => [
      key,
      toBoolean(update[key], DEFAULT_GLOBAL_KYC_CONFIG[key]),
    ]),
  );
}

function hasConfigChanged(current = {}, normalized = {}) {
  return (
    Object.hasOwn(current || {}, "requireVideoKyc") ||
    CONFIG_KEYS.some((key) => current?.[key] !== normalized[key])
  );
}

export async function ensureGlobalKycConfig() {
  const existing = await AdminProfile.collection.findOne(GLOBAL_QUERY);

  if (!existing) {
    await AdminProfile.collection.updateOne(
      GLOBAL_QUERY,
      {
        $setOnInsert: {
          owner: null,
          company: { name: GLOBAL_KYC_PROFILE_NAME },
          kyc: {
            status: "not_submitted",
            config: { ...DEFAULT_GLOBAL_KYC_CONFIG },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return {
      exists: true,
      created: true,
      config: { ...DEFAULT_GLOBAL_KYC_CONFIG },
      defaults: { ...DEFAULT_GLOBAL_KYC_CONFIG },
    };
  }

  const config = normalizeGlobalKycConfig(existing?.kyc?.config);
  if (hasConfigChanged(existing?.kyc?.config, config)) {
    await AdminProfile.collection.updateOne(
      GLOBAL_QUERY,
      {
        $set: {
          "kyc.config": config,
          updatedAt: new Date(),
        },
      },
    );
  }

  return {
    exists: true,
    created: false,
    config,
    defaults: { ...DEFAULT_GLOBAL_KYC_CONFIG },
  };
}

export async function updateGlobalKycConfig(update = {}) {
  const current = await ensureGlobalKycConfig();
  const config = normalizeGlobalKycConfig({
    ...current.config,
    ...sanitizeGlobalKycUpdate(update),
  });

  await AdminProfile.collection.updateOne(
    GLOBAL_QUERY,
    {
      $set: {
        "kyc.config": config,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    exists: true,
    created: current.created,
    config,
    defaults: { ...DEFAULT_GLOBAL_KYC_CONFIG },
  };
}

export async function getGlobalKycConfig() {
  const state = await ensureGlobalKycConfig();
  return state.config;
}
