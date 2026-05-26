import {
  getPlatformFeedbackList,
  getPlatformFeedbackSummary,
  updatePlatformFeedbackStatus,
} from "../../services/platformFeedback.service.js";

export async function listPlatformFeedback(req, res) {
  try {
    const filters = {
      search: req.query.search || "",
      issueType: req.query.issueType || "all",
      source: req.query.source || "all",
      deviceType: req.query.deviceType || "all",
      guestStatus: req.query.guestStatus || "all",
      resolved:
        req.query.resolved === "true"
          ? true
          : req.query.resolved === "false"
            ? false
            : null,
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 15,
    };

    const result = await getPlatformFeedbackList(filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function platformFeedbackSummary(req, res) {
  try {
    const filters = {
      search: req.query.search || "",
      issueType: req.query.issueType || "all",
      source: req.query.source || "all",
      deviceType: req.query.deviceType || "all",
      guestStatus: req.query.guestStatus || "all",
      resolved:
        req.query.resolved === "true"
          ? true
          : req.query.resolved === "false"
            ? false
            : null,
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
    };

    const result = await getPlatformFeedbackSummary(filters);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function setPlatformFeedbackStatus(req, res) {
  try {
    const result = await updatePlatformFeedbackStatus(req.params.id, {
      resolved: req.body?.resolved === true,
      actorId: req.user?._id || null,
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
