import { getMarketplaceSnapshot as getMarketplaceSnapshotService } from "../../services/superAdminMarketplace.service.js";

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
