import express from "express";
import {
  createEventSpace,
  deleteEventSpace,
  getEventSpaceById,
  getEventSpaceBySpace,
  updateEventSpace,
} from "../controllers/admin_controllers/eventSpace.controller.js";

const router = express.Router();

router.post("/space/:spaceId", createEventSpace);
router.get("/space/:spaceId", getEventSpaceBySpace);

router.get("/:eventSpaceId", getEventSpaceById);
router.patch("/:eventSpaceId", updateEventSpace);
router.delete("/:eventSpaceId", deleteEventSpace);

export default router;
