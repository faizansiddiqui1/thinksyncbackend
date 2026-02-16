// routes/resourceRoutes.js
import express from "express";
import * as controller from "../controllers/admin_controllers/resource.controller.js";

const router = express.Router();

// Create a resource for a given space
// POST /space/:spaceId/resources
router.post("/space/:spaceId/resources", controller.createResource);

// List resources for a space
// GET /space/:spaceId/resources
router.get("/space/:spaceId/resources", controller.listResourcesBySpace);

// Resource-level operations
// GET /resources/:resourceId
router.get("/resources/:resourceId", controller.getResource);

// PATCH /resources/:resourceId
router.patch("/resources/:resourceId", controller.updateResource);

// DELETE /resources/:resourceId
router.delete("/resources/:resourceId", controller.removeResource);

export default router;
