import express from "express";
import * as controller from "../controllers/admin_controllers/spaceDocument.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

router.post("/", requireAuth, controller.addDocument);
router.patch(
  "/:documentId/review",
  requireAuth,
  requireSuperAdmin,
  controller.reviewDocument,
);
router.delete("/:documentId", requireAuth, controller.deleteDocument);
router.get(
  "/space/:spaceId/effective",
  requireAuth,
  controller.getEffectiveDocumentsBySpace,
);
router.get("/:scopeType/:scopeId", requireAuth, controller.getDocumentsByScope);

export default router;
