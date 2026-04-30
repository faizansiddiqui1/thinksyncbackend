// routes/resourceRoutes.js
import express from "express";
import * as controller from "../controllers/admin_controllers/resource.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

// Create a resource for a given space
// POST /space/:spaceId/resources
router.post(
  "/space/:spaceId/resources",
  requireAuth,
  controller.createResource,
);

// Add resource images by resource id _id
router.post(
  "/space/:spaceId/resources/:resourceId/images",
  requireAuth,
  controller.addResourceImage,
);

// DELETE single image from resource
router.delete(
  "/resources/:resourceId/images/:imageId",
  requireAuth,
  controller.deleteResourceImage,
);

// GET /space/:spaceId/resources
router.get("/space/:spaceId/resources", controller.listResourcesBySpace);

// GET /resources (admin - get all resources)
router.get("/resources", requireAuth, controller.getAllResources);

// Resource-level operations
// GET /resources/:resourceId
router.get("/resources/:resourceId", controller.getResource);

// PATCH /resources/:resourceId
router.patch("/resources/:resourceId", controller.updateResource);

// DELETE /resources/:resourceId
router.delete("/resources/:resourceId", controller.removeResource);

export default router;
