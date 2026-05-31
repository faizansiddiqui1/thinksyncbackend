import { getMarketplaceSnapshot as getMarketplaceSnapshotService } from "../../services/superAdminMarketplace.service.js";
import {
  listSpaceAudit,
  listSuperAdminSpaces,
  updateSuperAdminSpaceStatus,
} from "../../services/superAdminSpace.service.js";

const isTrue = (value) =>
  value === true || value === "true" || value === 1 || value === "1";

export async function getMarketplaceSnapshot(req, res) {
  try {
    const data = await getMarketplaceSnapshotService({
      includeDocuments: isTrue(req.query.includeDocuments),
      includeWhiteLabels: req.query.includeWhiteLabels !== "false",
      includeReviews: isTrue(req.query.includeReviews),
      includeActivity: isTrue(req.query.includeActivity),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getSuperAdminSpaces(req, res) {
  try {
    const data = await listSuperAdminSpaces(req.query);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
}

export async function patchSuperAdminSpaceStatus(req, res) {
  try {
    const data = await updateSuperAdminSpaceStatus({
      spaceId: req.params.spaceId,
      action: req.body?.action,
      notes: req.body?.notes,
      actor: req.user,
    });

    return res.json({
      success: true,
      message: "Space status updated successfully",
      data,
    });
  } catch (err) {
    return res.status(err.status || 400).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getSuperAdminSpaceAudit(req, res) {
  try {
    const data = await listSpaceAudit(req.params.spaceId, {
      limit: req.query.limit,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
}
