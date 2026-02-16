import express from "express";
import {
  addSpaceImage,
  updateSpaceImage,
  deleteSpaceImage,
  addSpaceVideo,
  updateSpaceVideo,
  deleteSpaceVideo,
  getSpaceMedia,
  getPresignForImage,
  getPresignForVideo,
} from "../controllers/admin_controllers/spaceMedia.controller.js";

import { requireAuth } from "../middlewares/auth.js"
import { requireAdminApproved } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/rbac.js";

const router = express.Router();

/* GET media (public or optional auth) */
router.get("/space/:spaceId/media", getSpaceMedia);

/* PRESIGN */
router.post(
  "/space/:spaceId/media/images/presign",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  getPresignForImage
);

/* ---------- IMAGES ---------- */
router.post(
  "/space/:spaceId/media/images",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  addSpaceImage
);

router.put(
  "/space/:spaceId/media/images/:imageId",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  updateSpaceImage
);

router.delete(
  "/space/:spaceId/media/images/:imageId",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  deleteSpaceImage
);

/* ---------- VIDEO ---------- */
router.post(
  "/space/:spaceId/media/video/presign",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  getPresignForVideo
);

router.post(
  "/space/:spaceId/media/video",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  addSpaceVideo
);

router.put(
  "/space/:spaceId/media/video",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  updateSpaceVideo
);

router.delete(
  "/space/:spaceId/media/video",
  requireAuth,
  requireMinRole("admin"),
  requireAdminApproved,
  deleteSpaceVideo
);

export default router;
