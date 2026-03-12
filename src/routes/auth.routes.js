import express from "express";
import { otpRateLimiter } from "../middlewares/rateLimiter.js";
import {
  getActiveSessions,
  login,
  logout,
  logoutAllDevices,
  logoutSessionById,
  refreshAccessToken,
  sendOtpHandler,
  signup,
  verifyOtp,
} from "../controllers/user_controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.post("/signup", otpRateLimiter, signup);
router.post("/login", otpRateLimiter, login);

// router.post("/send-otp", otpRateLimiter, sendOtpHandler);
router.post("/send-otp", sendOtpHandler);

router.post("/verify-otp", verifyOtp);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);

router.get("/sessions", requireAuth, getActiveSessions);
router.delete("/sessions/:sessionId", requireAuth, logoutSessionById);
router.post("/logout-all", requireAuth, logoutAllDevices);




export default router;
