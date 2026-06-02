import express from "express";
import { getGoogleAuthUrl, googleCallback, getGoogleConnectionStatus, disconnectGoogleCalendar, getConnectedUsersStats, getConnectedUsersList } from "../controllers/user_controllers/googleAuth.controller.js";
import { requireAuth, requireAdminAccess } from "../middlewares/auth.js";

const router = express.Router();

// user endpoints
router.get("/google", requireAuth, getGoogleAuthUrl);
router.get("/google/callback", googleCallback);
router.get("/google/status", requireAuth, getGoogleConnectionStatus);
router.delete("/google", requireAuth, disconnectGoogleCalendar);

// super admin endpoints
router.get("/admin/google/stats", requireAuth, requireAdminAccess, getConnectedUsersStats);
router.get("/admin/google/users", requireAuth, requireAdminAccess, getConnectedUsersList);

export default router;
