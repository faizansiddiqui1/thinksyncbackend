

import express from "express";
import { createSmtp, listSmtps, getSmtp, deleteSmtp, toggleSmtpStatus, updateSmtp } from "../controllers/super_admin_controllers/smtpController.js";

const router = express.Router();

// 🔐 protect with admin middleware later
router.post("/", createSmtp);
router.get("/", listSmtps);
router.get("/:id", getSmtp);
router.put("/:id", updateSmtp);
router.patch("/:id/status", toggleSmtpStatus);
router.delete("/:id", deleteSmtp);

export default router;


