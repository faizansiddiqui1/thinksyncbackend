import express from "express";
import * as controller from "../controllers/admin_controllers/spaceDocument.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.post("/", requireAuth, controller.addDocument);
router.delete("/:documentId", requireAuth, controller.deleteDocument);
router.get("/:scopeType/:scopeId", requireAuth, controller.getDocumentsByScope);
router.get("/space/:spaceId/effective", requireAuth, controller.getEffectiveDocumentsBySpace);

export default router;