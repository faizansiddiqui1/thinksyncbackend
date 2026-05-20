import express from "express";
import * as controller from "../controllers/admin_controllers/addon.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

// POST /space/:spaceId/addons
router.post("/space/:spaceId/addons", requireAuth, controller.createAddon);


// POST /space/:spaceId/addons/:addonId/images
router.post(
  "/space/:spaceId/addons/:addonId/images",
  requireAuth,
  controller.addAddonImage,
);


// DELETE /addons/:addonId/images/:imageId
router.delete(
  "/addons/:addonId/images/:imageId",
  requireAuth,
  controller.deleteAddonImage,
);

// GET /space/:spaceId/addons
router.get("/space/:spaceId/addons", controller.listAddonsBySpace);

// GET /addons (admin)
router.get("/addons", requireAuth, controller.getAllAddons);

// GET /addons/:addonId
router.get("/addons/:addonId", controller.getAddon);

// PATCH /addons/:addonId
router.patch("/addons/:addonId", requireAuth, controller.updateAddon);

// DELETE /addons/:addonId
router.delete("/addons/:addonId", requireAuth, controller.removeAddon);

export default router;