import express from "express";
import * as controller from "../controllers/admin_controllers/seatingOption.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

// CREATE
// POST /api/seatingOption/space/:spaceId/seating-options
router.post(
  "/space/:spaceId/seating-options",
  requireAuth,
  controller.createSeatingOption,
);

// LIST BY SPACE
// GET /api/seatingOption/space/:spaceId/seating-options
router.get(
  "/space/:spaceId/seating-options",
  controller.listSeatingOptionsBySpace,
);

// GET ONE
// GET /api/seatingOption/seating-options/:optionId
router.get(
  "/seating-options/:optionId",
  controller.getSeatingOption,
);

// UPDATE
// PATCH /api/seatingOption/seating-options/:optionId
router.patch(
  "/seating-options/:optionId",
  requireAuth,
  controller.updateSeatingOption,
);

// DELETE
// DELETE /api/seatingOption/seating-options/:optionId
router.delete(
  "/seating-options/:optionId",
  requireAuth,
  controller.removeSeatingOption,
);

// IMAGE ADD
// POST /api/seatingOption/space/:spaceId/seating-options/:optionId/images
router.post(
  "/space/:spaceId/seating-options/:optionId/images",
  requireAuth,
  controller.addSeatingOptionImage,
);

// IMAGE DELETE
// DELETE /api/seatingOption/seating-options/:optionId/images/:imageId
router.delete(
  "/seating-options/:optionId/images/:imageId",
  requireAuth,
  controller.deleteSeatingOptionImage,
);

export default router;