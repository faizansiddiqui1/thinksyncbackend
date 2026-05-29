import express from "express";
import {
  addToSavedSpaces,
  getAllSavedSpacesAdmin,
  getMySavedSpaces,
  getSavedSpacesByUser,
  removeFromSavedSpaces,
} from "../controllers/user_controllers/savedSpace.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.post("/", requireAuth, addToSavedSpaces);
router.get("/me", requireAuth, getMySavedSpaces);

router.get(
  "/",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  getAllSavedSpacesAdmin,
);

router.get(
  "/user/:userId",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  getSavedSpacesByUser,
);

router.delete("/:id", requireAuth, removeFromSavedSpaces);

export default router;

