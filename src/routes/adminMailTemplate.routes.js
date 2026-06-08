import express from "express";
import { requireAdminAccess, requireAuth } from "../middlewares/auth.js";
import {
  createMailTemplate,
  deleteMailTemplate,
  getMailTemplateById,
  getMailTemplateMeta,
  listMailTemplates,
  previewMailTemplate,
  restoreMailTemplateDefault,
  sendTestMailTemplate,
  toggleMailTemplateStatus,
  updateMailTemplate,
} from "../controllers/super_admin_controllers/adminMailTemplate.controller.js";

const router = express.Router();

const requireTemplateAccess = (req, res, next) => {
  if (req.user?.role === "consultant") return next();
  return requireAdminAccess(req, res, next);
};

router.use(requireAuth, requireTemplateAccess);

router.get("/meta", getMailTemplateMeta);
router.post("/preview", previewMailTemplate);
router.post("/test", sendTestMailTemplate);
router.get("/", listMailTemplates);
router.post("/", createMailTemplate);
router.get("/:id", getMailTemplateById);
router.put("/:id", updateMailTemplate);
router.patch("/:id/status", toggleMailTemplateStatus);
router.post("/:id/restore-default", restoreMailTemplateDefault);
router.delete("/:id", deleteMailTemplate);

export default router;
