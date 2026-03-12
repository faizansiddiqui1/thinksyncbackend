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
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

/* GET media (public or optional auth) */
router.get("/space/:spaceId/media", getSpaceMedia);


/* ---------- IMAGES ---------- */
router.post("/uploads/presign", getPresignForImage);

router.post("/space/:spaceId/media/images", addSpaceImage);

router.put("/space/:spaceId/media/images/:imageId", updateSpaceImage);

router.delete("/space/:spaceId/media/images/:imageId", deleteSpaceImage);

/* ---------- VIDEO ---------- */
router.post("/space/:spaceId/media/video/presign", getPresignForVideo);

router.post("/space/:spaceId/media/video", requireAuth, addSpaceVideo);

router.put("/space/:spaceId/media/video", updateSpaceVideo);

router.delete("/space/:spaceId/media/video", deleteSpaceVideo);

export default router;
