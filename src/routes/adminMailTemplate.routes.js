import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import {
  createMailTemplate,
  deleteMailTemplate,
  getMailTemplateById,
  getMailTemplateMeta,
  listMailTemplates,
  previewMailTemplate,
  toggleMailTemplateStatus,
  updateMailTemplate,
} from "../controllers/super_admin_controllers/adminMailTemplate.controller.js";

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/meta", getMailTemplateMeta);
router.post("/preview", previewMailTemplate);
router.get("/", listMailTemplates);
router.post("/", createMailTemplate);
router.get("/:id", getMailTemplateById);
router.put("/:id", updateMailTemplate);
router.patch("/:id/status", toggleMailTemplateStatus);
router.delete("/:id", deleteMailTemplate);

export default router;
