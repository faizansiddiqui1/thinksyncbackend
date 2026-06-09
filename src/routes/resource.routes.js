// routes/resourceRoutes.js
import express from "express";
import * as controller from "../controllers/admin_controllers/resource.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

// Create a resource for a given space
// POST /space/:spaceId/resources
router.post(
  "/space/:spaceId/resources",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "create"),
  controller.createResource,
);

// Add resource images by resource id _id
router.post(
  "/space/:spaceId/resources/:resourceId/images",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "update"),
  controller.addResourceImage,
);

router.patch(
  "/resources/:resourceId/images/:imageId",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "update"),
  controller.updateResourceImageMetadata,
);

router.put(
  "/resources/:resourceId/images/reorder",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "update"),
  controller.reorderResourceImages,
);

router.put(
  "/resources/:resourceId/images/:imageId/primary",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "update"),
  controller.setPrimaryResourceImage,
);

// DELETE single image from resource
router.delete(
  "/resources/:resourceId/images/:imageId",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "delete"),
  controller.deleteResourceImage,
);

// GET /space/:spaceId/resources
router.get(
  "/space/:spaceId/resources",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "read"),
  controller.listResourcesBySpace,
);

// GET /resources (admin - get all resources)
router.get(
  "/resources",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "read"),
  controller.getAllResources,
);

// Resource-level operations
// GET /resources/:resourceId
router.get(
  "/resources/:resourceId",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "read"),
  controller.getResource,
);

// PATCH /resources/:resourceId
router.patch(
  "/resources/:resourceId",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "update"),
  controller.updateResource,
);

// DELETE /resources/:resourceId
router.delete(
  "/resources/:resourceId",
  requireAuth,
  requireAdminAccess,
  requirePermission("resources", "delete"),
  controller.removeResource,
);

export default router;
