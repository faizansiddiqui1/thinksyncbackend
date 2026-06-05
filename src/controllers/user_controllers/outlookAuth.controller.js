import * as outlookAuthService from "../../services/outlookAuth.service.js";
import { syncAllActiveBookingsForUser } from "../../services/calendarSync.service.js";

export const getOutlookAuthUrl = async (req, res) => {
  try {
    const url = outlookAuthService.generateAuthUrl({ userId: req.user?._id });
    return res.json({ success: true, url });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const outlookCallback = async (req, res) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) {
      return res.status(400).send(errorDescription || error);
    }
    if (!code) return res.status(400).send("Missing code");

    const userId = outlookAuthService.getUserIdFromState(state);
    if (!userId) return res.status(400).send("Invalid state");

    const tokens = await outlookAuthService.exchangeCodeForTokens(code);
    await outlookAuthService.saveTokensForUser(userId, tokens);
    await syncAllActiveBookingsForUser(userId);

    const redirect = process.env.FRONTEND_URL || "http://localhost:4028";
    return res.redirect(`${redirect}/dashboard?outlook_connected=1`);
  } catch (error) {
    console.error("outlook callback error:", error);
    return res.status(500).send("Outlook callback failed");
  }
};

export const getOutlookConnectionStatus = async (req, res) => {
  try {
    const tokenDoc = await outlookAuthService.getTokensForUser(req.user?._id);
    return res.json({
      success: true,
      connected: Boolean(tokenDoc),
      email: tokenDoc?.outlookEmail || "",
      lastSyncTime: tokenDoc?.lastSyncTime || null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const syncOutlookCalendar = async (req, res) => {
  try {
    const tokenDoc = await outlookAuthService.getTokensForUser(req.user?._id);
    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        error: "Outlook Calendar is not connected",
      });
    }

    const result = await syncAllActiveBookingsForUser(req.user._id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const disconnectOutlookCalendar = async (req, res) => {
  try {
    const disconnected = await outlookAuthService.disconnectOutlookCalendar(req.user?._id);
    return res.json({
      success: true,
      connected: false,
      disconnected,
      message: disconnected
        ? "Outlook Calendar disconnected"
        : "Outlook Calendar was already disconnected",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
