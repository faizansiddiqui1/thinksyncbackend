import * as googleAuthService from "../../services/googleAuth.service.js";
import { requireAuth } from "../../middlewares/auth.js";
import { syncAllActiveBookingsForUser } from "../../services/calendarSync.service.js";

export const getGoogleAuthUrl = async (req, res) => {
  try {
    const userId = req.user?._id;
    const url = googleAuthService.generateAuthUrl({ userId });
    return res.json({ success: true, url });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");

    const tokens = await googleAuthService.exchangeCodeForTokens(code, state);

    // state contains base64(userId)
    const userId = state ? Buffer.from(String(state), "base64").toString("utf8") : null;
    if (!userId) {
      // cannot associate
      return res.status(400).send("Missing state user mapping");
    }

    await googleAuthService.saveTokensForUser(userId, tokens);
    await syncAllActiveBookingsForUser(userId);

    // redirect to frontend or show success
    const redirect = process.env.FRONTEND_URL || "http://localhost:4028";
    return res.redirect(`${redirect}/dashboard?google_connected=1`);
  } catch (err) {
    console.error("google callback error", err);
    return res.status(500).send("Google callback failed");
  }
};

export const getGoogleConnectionStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const tokenDoc = await googleAuthService.getTokensForUser(userId);
    const connected = !!tokenDoc;

    return res.json({ success: true, connected });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const disconnectGoogleCalendar = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const disconnected = await googleAuthService.disconnectGoogleCalendar(userId);
    return res.json({
      success: true,
      connected: false,
      disconnected,
      message: disconnected
        ? "Google Calendar disconnected"
        : "Google Calendar was already disconnected",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getConnectedUsersStats = async (req, res) => {
  try {
    // only super admin can view this
    const GoogleToken = (await import("../../models/user_models/GoogleToken.js")).default;
    const User = (await import("../../models/user_models/User.js")).default;

    const count = await GoogleToken.countDocuments();

    return res.json({ success: true, data: { connectedUsersCount: count } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getConnectedUsersList = async (req, res) => {
  try {
    // only super admin can view this
    const GoogleToken = (await import("../../models/user_models/GoogleToken.js")).default;
    const User = (await import("../../models/user_models/User.js")).default;

    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const tokens = await GoogleToken.find()
      .populate("userId", "email username name phoneNumber")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await GoogleToken.countDocuments();

    const list = tokens.map((t) => ({
      userId: t.userId?._id,
      email: t.userId?.email,
      username: t.userId?.username,
      name: t.userId?.name,
      connectedAt: t.createdAt,
      tokenStatus: "active",
    }));

    return res.json({
      success: true,
      data: {
        list,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
