import express from "express";
import {
  createSmtp,
  deleteSmtp,
  getSmtp,
  listSmtps,
  toggleSmtpStatus,
  updateSmtp,
} from "../controllers/super_admin_controllers/smtpController.js";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

router.use(requireAuth, requireSuperAdmin);

router.post("/", createSmtp);
router.get("/", listSmtps);
router.get("/:id", getSmtp);
router.put("/:id", updateSmtp);
router.patch("/:id/status", toggleSmtpStatus);
router.delete("/:id", deleteSmtp);

export default router;
