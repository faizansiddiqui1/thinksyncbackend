import express from "express";
import {
  addSpaceImage,
  updateSpaceImage,
  reorderSpaceImages,
  setPrimarySpaceImage,
  deleteSpaceImage,
  addSpaceVideo,
  updateSpaceVideo,
  deleteSpaceVideo,
  getSpaceMedia,
  getPresignForImage,
  getPresignForVideo,
} from "../controllers/admin_controllers/spaceMedia.controller.js";
import { requireAdminAccess, requireAuth } from "../middlewares/auth.js";

const router = express.Router();

/* GET media (public or optional auth) */
router.get("/space/:spaceId/media", getSpaceMedia);


/* ---------- IMAGES ---------- */
router.post("/uploads/presign", requireAuth, requireAdminAccess, getPresignForImage);

router.post("/space/:spaceId/media/images", requireAuth, requireAdminAccess, addSpaceImage);

router.put("/space/:spaceId/media/images/reorder", requireAuth, requireAdminAccess, reorderSpaceImages);

router.put("/space/:spaceId/media/images/:imageId", requireAuth, requireAdminAccess, updateSpaceImage);

router.put("/space/:spaceId/media/images/:imageId/primary", requireAuth, requireAdminAccess, setPrimarySpaceImage);

router.delete("/space/:spaceId/media/images/:imageId", requireAuth, requireAdminAccess, deleteSpaceImage);

/* ---------- VIDEO ---------- */
router.post("/space/:spaceId/media/video/presign", requireAuth, requireAdminAccess, getPresignForVideo);

router.post("/space/:spaceId/media/video", requireAuth, requireAdminAccess, addSpaceVideo);

router.put("/space/:spaceId/media/video", requireAuth, requireAdminAccess, updateSpaceVideo);

router.delete("/space/:spaceId/media/video", requireAuth, requireAdminAccess, deleteSpaceVideo);

export default router;
