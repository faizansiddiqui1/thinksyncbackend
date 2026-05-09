import express from "express";
import {
  createVirtualOfficePlan,
  getVirtualOfficePlansBySpace,
  getVirtualOfficePlanById,
  updateVirtualOfficePlan,
  deleteVirtualOfficePlan,
} from "../controllers/admin_controllers/virtualOfficePlan.controller.js";

const router = express.Router();

/**
 * Space-specific routes
 * same pattern as resources
 */
router.post("/space/:spaceId", createVirtualOfficePlan);
router.get("/space/:spaceId", getVirtualOfficePlansBySpace);

/**
 * Single plan routes
 */
router.get("/:planId", getVirtualOfficePlanById);
router.patch("/:planId", updateVirtualOfficePlan);
router.delete("/:planId", deleteVirtualOfficePlan);

export default router;