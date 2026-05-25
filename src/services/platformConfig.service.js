import PlatformConfig from "../models/super_admin_models/PlatformConfig.js";
import PlatformConfigAudit from "../models/super_admin_models/PlatformConfigAudit.js";
import {
  getPlatformConfigDefinition,
  listPlatformConfigDefinitions,
  PLATFORM_CONFIG_CATEGORY_META,
} from "./platformConfig.catalog.js";
import {
  buildPlatformConfigStoragePayload,
  getPlatformConfigEnvValue,
  getPlatformConfigRecordMap,
  getPlatformConfigValue,
  invalidatePlatformConfigCache,
  maskPlatformConfigValue,
} from "./platformConfigResolver.service.js";
import { encrypt } from "../utils/crypto.util.js";

function normalizeScope(scope) {
  return String(scope || "all").trim().toLowerCase();
}

function normalizeSearch(search) {
  return String(search || "").trim().toLowerCase();
}

function buildActorMeta(actor = {}) {
  return {
    actorId: actor?._id || null,
    actorRole: actor?.role || "",
  };
}

function buildAuditState(definition, record, envValue, resolvedValue) {
  if (!definition) return null;

  const hasOverride = Boolean(record);
  const overrideEnabled = Boolean(record?.isEnabled !== false && record);

  return {
    hasOverride,
    overrideEnabled,
    source:
      hasOverride && overrideEnabled
        ? "database"
        : envValue !== undefined
          ? "env"
          : "default",
    maskedValue: maskPlatformConfigValue(definition, resolvedValue),
    isSensitive: Boolean(definition.isSensitive),
  };
}

async function createAuditLog({
  key,
  action,
  category,
  actor,
  previousState,
  nextState,
  meta = null,
}) {
  try {
    await PlatformConfigAudit.create({
      key,
      action,
      category,
      ...buildActorMeta(actor),
      previousState,
      nextState,
      meta,
    });
  } catch (error) {
    console.error("Platform config audit log failed:", error?.message || error);
  }
}

async function buildClientItem(definition, record) {
  const envValue = getPlatformConfigEnvValue(definition);
  const resolvedValue = await getPlatformConfigValue(definition.key);
  const hasOverride = Boolean(record);
  const overrideEnabled = Boolean(record?.isEnabled !== false && record);
  const source =
    hasOverride && overrideEnabled
      ? "database"
      : envValue !== undefined
        ? "env"
        : definition.defaultValue !== null && definition.defaultValue !== undefined
          ? "default"
          : "missing";

  return {
    key: definition.key,
    envKey:
      Array.isArray(definition.envKeys) && definition.envKeys.length
        ? definition.envKeys[0]
        : definition.key,
    envKeys:
      Array.isArray(definition.envKeys) && definition.envKeys.length
        ? definition.envKeys
        : [definition.key],
    label: definition.label,
    description: definition.description,
    category: definition.category,
    pageGroups: definition.pageGroups,
    type: definition.type,
    options: definition.options || [],
    isSensitive: Boolean(definition.isSensitive),
    hasOverride,
    overrideEnabled,
    source,
    value: definition.isSensitive ? null : resolvedValue,
    displayValue: maskPlatformConfigValue(definition, resolvedValue),
    envValue:
      envValue === undefined
        ? null
        : definition.isSensitive
          ? null
          : envValue,
    envDisplayValue:
      envValue === undefined
        ? ""
        : maskPlatformConfigValue(definition, envValue),
    envAvailable: envValue !== undefined,
    updatedAt: record?.updatedAt || null,
    note: record?.note || "",
  };
}

export async function listPlatformConfigs({ scope = "all", search = "" } = {}) {
  const normalizedScope = normalizeScope(scope);
  const normalizedSearch = normalizeSearch(search);
  const definitions = listPlatformConfigDefinitions({
    scope: normalizedScope,
    search: normalizedSearch,
  });
  const recordMap = await getPlatformConfigRecordMap();

  const items = await Promise.all(
    definitions.map((definition) =>
      buildClientItem(definition, recordMap.get(definition.key) || null),
    ),
  );

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = {
        key: item.category,
        label: PLATFORM_CONFIG_CATEGORY_META[item.category]?.label || item.category,
        description:
          PLATFORM_CONFIG_CATEGORY_META[item.category]?.description || "",
        items: [],
      };
    }

    acc[item.category].items.push(item);
    return acc;
  }, {});

  const categories = Object.values(grouped);

  return {
    scope: normalizedScope,
    search: normalizedSearch,
    categories,
    items,
    stats: {
      total: items.length,
      overridden: items.filter((item) => item.hasOverride).length,
      activeOverrides: items.filter(
        (item) => item.hasOverride && item.overrideEnabled,
      ).length,
      envFallback: items.filter((item) => item.source === "env").length,
      missing: items.filter((item) => item.source === "missing").length,
    },
  };
}

async function persistSensitivePayload(payload) {
  if (!payload?.encryptedValue) {
    return null;
  }

  return encrypt(payload.encryptedValue);
}

export async function upsertPlatformConfigItem({
  key,
  value,
  isEnabled,
  note,
  actor,
}) {
  const definition = getPlatformConfigDefinition(key);

  if (!definition) {
    throw new Error(`Unsupported platform config key: ${key}`);
  }

  const existing = await PlatformConfig.findOne({ key: definition.key }).lean().exec();
  const previousEnvValue = getPlatformConfigEnvValue(definition);
  const previousResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  const update = {
    category: definition.category,
    valueType: definition.type,
    isSensitive: Boolean(definition.isSensitive),
    updatedBy: actor?._id || null,
  };

  if (note !== undefined) {
    update.note = String(note || "").trim();
  }

  if (typeof isEnabled === "boolean") {
    update.isEnabled = isEnabled;
  } else if (!existing) {
    update.isEnabled = true;
  }

  if (value !== undefined) {
    const payload = buildPlatformConfigStoragePayload(definition, value);
    if (definition.isSensitive) {
      update.encryptedValue = await persistSensitivePayload(payload);
      update.value = null;
    } else {
      update.value = payload.value;
      update.encryptedValue = null;
    }
  } else if (!existing) {
    throw new Error(`${definition.key} value is required to create an override`);
  }

  const record = await PlatformConfig.findOneAndUpdate(
    { key: definition.key },
    {
      $set: update,
      $setOnInsert: {
        key: definition.key,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  )
    .lean()
    .exec();

  invalidatePlatformConfigCache();

  const nextEnvValue = getPlatformConfigEnvValue(definition);
  const nextResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  await createAuditLog({
    key: definition.key,
    action: "upsert",
    category: definition.category,
    actor,
    previousState: buildAuditState(
      definition,
      existing,
      previousEnvValue,
      previousResolvedValue,
    ),
    nextState: buildAuditState(
      definition,
      record,
      nextEnvValue,
      nextResolvedValue,
    ),
  });

  return buildClientItem(definition, record);
}

export async function updatePlatformConfigs({ items = [], actor }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one config item is required");
  }

  const results = [];
  for (const item of items) {
    results.push(
      await upsertPlatformConfigItem({
        key: item?.key,
        value: item?.value,
        isEnabled: item?.isEnabled,
        note: item?.note,
        actor,
      }),
    );
  }

  return results;
}

export async function setPlatformConfigStatus({ key, isEnabled, actor }) {
  const definition = getPlatformConfigDefinition(key);

  if (!definition) {
    throw new Error(`Unsupported platform config key: ${key}`);
  }

  if (typeof isEnabled !== "boolean") {
    throw new Error("isEnabled must be boolean");
  }

  const existing = await PlatformConfig.findOne({ key: definition.key }).lean().exec();
  if (!existing) {
    throw new Error(`No database override exists for ${definition.key}`);
  }

  const previousEnvValue = getPlatformConfigEnvValue(definition);
  const previousResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  const record = await PlatformConfig.findOneAndUpdate(
    { key: definition.key },
    {
      $set: {
        isEnabled,
        updatedBy: actor?._id || null,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .lean()
    .exec();

  invalidatePlatformConfigCache();

  const nextEnvValue = getPlatformConfigEnvValue(definition);
  const nextResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  await createAuditLog({
    key: definition.key,
    action: "toggle",
    category: definition.category,
    actor,
    previousState: buildAuditState(
      definition,
      existing,
      previousEnvValue,
      previousResolvedValue,
    ),
    nextState: buildAuditState(
      definition,
      record,
      nextEnvValue,
      nextResolvedValue,
    ),
    meta: { isEnabled },
  });

  return buildClientItem(definition, record);
}

export async function resetPlatformConfig({ key, actor }) {
  const definition = getPlatformConfigDefinition(key);

  if (!definition) {
    throw new Error(`Unsupported platform config key: ${key}`);
  }

  const existing = await PlatformConfig.findOne({ key: definition.key }).lean().exec();
  if (!existing) {
    return buildClientItem(definition, null);
  }

  const previousEnvValue = getPlatformConfigEnvValue(definition);
  const previousResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  await PlatformConfig.deleteOne({ key: definition.key }).exec();
  invalidatePlatformConfigCache();

  const nextEnvValue = getPlatformConfigEnvValue(definition);
  const nextResolvedValue = await getPlatformConfigValue(definition.key, {
    forceRefresh: true,
  });

  await createAuditLog({
    key: definition.key,
    action: "reset",
    category: definition.category,
    actor,
    previousState: buildAuditState(
      definition,
      existing,
      previousEnvValue,
      previousResolvedValue,
    ),
    nextState: buildAuditState(definition, null, nextEnvValue, nextResolvedValue),
  });

  return buildClientItem(definition, null);
}

export async function listPlatformConfigAudit({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return PlatformConfigAudit.find({})
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean()
    .exec();
}
