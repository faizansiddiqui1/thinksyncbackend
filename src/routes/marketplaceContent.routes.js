import express from "express";

import {
  createAdminContent,
  deleteAdminContent,
  getPublicContent,
  listAdminContent,
  listPublicContent,
  updateAdminContent,
} from "../controllers/super_admin_controllers/marketplaceContent.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

router.get("/public/content/:type", listPublicContent);
router.get("/public/content/:type/:slug", getPublicContent);

router.get("/admin/marketplace-content/:type", requireAuth, requireSuperAdmin, listAdminContent);
router.post("/admin/marketplace-content/:type", requireAuth, requireSuperAdmin, createAdminContent);
router.patch("/admin/marketplace-content/:type/:id", requireAuth, requireSuperAdmin, updateAdminContent);
router.delete("/admin/marketplace-content/:type/:id", requireAuth, requireSuperAdmin, deleteAdminContent);

export default router;
