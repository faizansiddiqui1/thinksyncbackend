import PlatformConfig from "../models/super_admin_models/PlatformConfig.js";
import {
  getPlatformConfigDefinition,
  listPlatformConfigDefinitions,
} from "./platformConfig.catalog.js";
import { decrypt } from "../utils/crypto.util.js";

const CACHE_TTL_MS = 30 * 1000;

const cacheState = {
  loadedAt: 0,
  promise: null,
  records: new Map(),
};

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return Boolean(value);
}

export function coercePlatformConfigValue(definition, rawValue) {
  if (!definition) {
    throw new Error("Config definition is required");
  }

  if (rawValue === undefined) return undefined;
  if (rawValue === null) return null;

  if (definition.type === "number") {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${definition.key} must be a valid number`);
    }
    return parsed;
  }

  if (definition.type === "boolean") {
    return parseBoolean(rawValue);
  }

  if (definition.type === "json") {
    if (typeof rawValue === "string") {
      try {
        return JSON.parse(rawValue);
      } catch {
        throw new Error(`${definition.key} must be valid JSON`);
      }
    }

    return rawValue;
  }

  return String(rawValue);
}

function serializeSensitiveValue(definition, value) {
  if (value === null || value === undefined) return null;
  return definition.type === "json" ? JSON.stringify(value) : String(value);
}

function getRawEnvValue(definition) {
  const envKeys =
    Array.isArray(definition?.envKeys) && definition.envKeys.length
      ? definition.envKeys
      : [definition?.key];

  for (const envKey of envKeys) {
    if (process.env[envKey] !== undefined) {
      return process.env[envKey];
    }
  }

  return undefined;
}

function parseStoredRecordValue(definition, record) {
  if (!record) return undefined;

  if (definition?.isSensitive) {
    if (!record.encryptedValue) return undefined;
    return coercePlatformConfigValue(
      definition,
      decrypt(record.encryptedValue),
    );
  }

  return coercePlatformConfigValue(definition, record.value);
}

async function loadRecords(forceRefresh = false) {
  const cacheIsFresh =
    !forceRefresh &&
    cacheState.loadedAt &&
    Date.now() - cacheState.loadedAt < CACHE_TTL_MS;

  if (cacheIsFresh) {
    return cacheState.records;
  }

  if (cacheState.promise) {
    return cacheState.promise;
  }

  cacheState.promise = PlatformConfig.find({})
    .lean()
    .exec()
    .then((records) => {
      cacheState.records = new Map(
        records.map((record) => [String(record.key).trim(), record]),
      );
      cacheState.loadedAt = Date.now();
      return cacheState.records;
    })
    .finally(() => {
      cacheState.promise = null;
    });

  return cacheState.promise;
}

export function invalidatePlatformConfigCache() {
  cacheState.records = new Map();
  cacheState.loadedAt = 0;
  cacheState.promise = null;
}

export async function getPlatformConfigRecordMap({ forceRefresh = false } = {}) {
  return loadRecords(forceRefresh);
}

export async function getPlatformConfigValue(key, options = {}) {
  const definition = getPlatformConfigDefinition(key);

  if (!definition) {
    return options.defaultValue;
  }

  const records = await loadRecords(options.forceRefresh);
  const record = records.get(definition.key) || null;

  if (record?.isEnabled !== false) {
    const storedValue = parseStoredRecordValue(definition, record);
    if (storedValue !== undefined) {
      return storedValue;
    }
  }

  const envRawValue = getRawEnvValue(definition);
  if (envRawValue !== undefined) {
    return coercePlatformConfigValue(definition, envRawValue);
  }

  if (definition.defaultValue !== null && definition.defaultValue !== undefined) {
    return definition.defaultValue;
  }

  return options.defaultValue;
}

export async function getPlatformConfigValues(keys = [], options = {}) {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getPlatformConfigValue(key, options)]),
  );

  return Object.fromEntries(entries);
}

export async function getPlatformConfigSnapshot(options = {}) {
  const definitions = listPlatformConfigDefinitions(options);
  const records = await loadRecords(options.forceRefresh);

  return definitions.map((definition) => ({
    definition,
    record: records.get(definition.key) || null,
    envValue: getRawEnvValue(definition),
  }));
}

export async function getResolvedPlatformConfigEntry(key, options = {}) {
  const definition = getPlatformConfigDefinition(key);

  if (!definition) {
    return null;
  }

  const records = await loadRecords(options.forceRefresh);
  const record = records.get(definition.key) || null;
  const envValue = getRawEnvValue(definition);
  const resolvedValue = await getPlatformConfigValue(key, options);

  return {
    definition,
    record,
    envValue,
    resolvedValue,
  };
}

export function maskPlatformConfigValue(definition, value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (!definition?.isSensitive) {
    return definition?.type === "json" ? JSON.stringify(value) : String(value);
  }

  const asText =
    definition?.type === "json" ? JSON.stringify(value) : String(value);
  const tail = asText.slice(-4);

  if (asText.length <= 4) {
    return "*".repeat(asText.length);
  }

  return `${"*".repeat(Math.max(asText.length - 4, 4))}${tail}`;
}

export function getPlatformConfigEnvValue(definition) {
  const rawValue = getRawEnvValue(definition);
  if (rawValue === undefined) return undefined;
  return coercePlatformConfigValue(definition, rawValue);
}

export function buildPlatformConfigStoragePayload(definition, value) {
  const normalizedValue = coercePlatformConfigValue(definition, value);

  if (definition.isSensitive) {
    return {
      value: null,
      encryptedValue: serializeSensitiveValue(definition, normalizedValue),
    };
  }

  return {
    value: normalizedValue,
    encryptedValue: null,
  };
}
