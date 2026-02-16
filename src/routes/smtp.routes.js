import express from "express";
import { createSmtp, deleteSmtp, getSmtp, listSmtps, toggleSmtpStatus, updateSmtp } from "../models/super_admin_models/smtpController.js";

const router = express.Router();

// 🔐 protect with admin middleware later
router.post("/", createSmtp);
router.get("/", listSmtps);
router.get("/:id", getSmtp);
router.put("/:id", updateSmtp);
router.patch("/:id/status", toggleSmtpStatus);
router.delete("/:id", deleteSmtp);

export default router;
