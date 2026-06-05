import express from "express";
import {
  disconnectOutlookCalendar,
  getOutlookAuthUrl,
  getOutlookConnectionStatus,
  outlookCallback,
  syncOutlookCalendar,
} from "../controllers/user_controllers/outlookAuth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/outlook", requireAuth, getOutlookAuthUrl);
router.get("/outlook/callback", outlookCallback);
router.get("/outlook/status", requireAuth, getOutlookConnectionStatus);
router.delete("/outlook", requireAuth, disconnectOutlookCalendar);

router.post("/calendar/outlook/sync", requireAuth, syncOutlookCalendar);
router.delete("/calendar/outlook/disconnect", requireAuth, disconnectOutlookCalendar);

export default router;
