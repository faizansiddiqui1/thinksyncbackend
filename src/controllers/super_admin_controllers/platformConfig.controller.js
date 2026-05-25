import {
  listPlatformConfigAudit,
  listPlatformConfigs,
  resetPlatformConfig,
  setPlatformConfigStatus,
  updatePlatformConfigs,
  upsertPlatformConfigItem,
} from "../../services/platformConfig.service.js";

function normalizeItems(body = {}) {
  if (Array.isArray(body?.items)) return body.items;
  if (body?.key) return [body];
  return [];
}

export async function getPlatformConfigs(req, res) {
  try {
    const data = await listPlatformConfigs({
      scope: req.query.scope || "all",
      search: req.query.search || "",
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function savePlatformConfigs(req, res) {
  try {
    const items = normalizeItems(req.body);

    const data =
      items.length === 1
        ? await upsertPlatformConfigItem({
            ...items[0],
            actor: req.user,
          })
        : await updatePlatformConfigs({
            items,
            actor: req.user,
          });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function togglePlatformConfig(req, res) {
  try {
    const data = await setPlatformConfigStatus({
      key: req.params.key,
      isEnabled: req.body?.isEnabled,
      actor: req.user,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function resetPlatformConfigOverride(req, res) {
  try {
    const data = await resetPlatformConfig({
      key: req.params.key,
      actor: req.user,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getPlatformConfigAuditLog(req, res) {
  try {
    const data = await listPlatformConfigAudit({
      limit: req.query.limit,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}
