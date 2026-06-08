import express from "express";

import {
  listEmailActivity,
  listCrmCampaigns,
  listCrmUsers,
  sendCrmCampaign,
  trackProviderDelivery,
  trackEmailClick,
  trackEmailOpen,
  unsubscribeEmail,
} from "../controllers/admin_controllers/crm.controller.js";
import { requireAdminAccess, requireAuth } from "../middlewares/auth.js";

const router = express.Router();

const requireCrmAccess = (req, res, next) => {
  if (req.user?.role === "consultant") return next();
  return requireAdminAccess(req, res, next);
};

router.get("/email-tracking/open/:token", trackEmailOpen);
router.get("/email-tracking/click/:token", trackEmailClick);
router.get("/email-tracking/unsubscribe/:token", unsubscribeEmail);
router.post("/email-tracking/provider", trackProviderDelivery);

router.get("/admin/crm/users", requireAuth, requireCrmAccess, listCrmUsers);
router.get("/admin/crm/campaigns", requireAuth, requireCrmAccess, listCrmCampaigns);
router.get("/admin/crm/email-activity", requireAuth, requireCrmAccess, listEmailActivity);
router.post("/admin/crm/campaigns", requireAuth, requireCrmAccess, sendCrmCampaign);

export default router;
