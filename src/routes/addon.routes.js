import express from "express";
import * as controller from "../controllers/admin_controllers/addon.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

// POST /space/:spaceId/addons
router.post(
  "/space/:spaceId/addons",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "create"),
  controller.createAddon,
);


// POST /space/:spaceId/addons/:addonId/images
router.post(
  "/space/:spaceId/addons/:addonId/images",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "update"),
  controller.addAddonImage,
);


// DELETE /addons/:addonId/images/:imageId
router.delete(
  "/addons/:addonId/images/:imageId",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "delete"),
  controller.deleteAddonImage,
);

// GET /space/:spaceId/addons
router.get(
  "/space/:spaceId/addons",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "read"),
  controller.listAddonsBySpace,
);

// GET /addons (admin)
router.get(
  "/addons",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "read"),
  controller.getAllAddons,
);

// GET /addons/:addonId
router.get(
  "/addons/:addonId",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "read"),
  controller.getAddon,
);

// PATCH /addons/:addonId
router.patch(
  "/addons/:addonId",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "update"),
  controller.updateAddon,
);

// DELETE /addons/:addonId
router.delete(
  "/addons/:addonId",
  requireAuth,
  requireAdminAccess,
  requirePermission("addons", "delete"),
  controller.removeAddon,
);

export default router;
