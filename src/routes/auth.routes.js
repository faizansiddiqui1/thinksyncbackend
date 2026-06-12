import express from "express";
import {
  generalRateLimiter,
  otpRateLimiter,
  otpSendRateLimiter,
} from "../middlewares/rateLimiter.js";
import {
  disableTwoFactorHandler,
  enableTwoFactorEnrollmentHandler,
  getActiveSessions,
  getSecurityActivityHandler,
  getTrustedDevicesHandler,
  getTwoFactorStatusHandler,
  login,
  logout,
  logoutAllDevices,
  logoutSessionById,
  passwordLogin,
  passwordSignup,
  refreshAccessToken,
  regenerateBackupCodesHandler,
  requestPasswordResetHandler,
  resetPasswordHandler,
  revokeTrustedDeviceHandler,
  sendOtpHandler,
  signup,
  startTwoFactorEnrollmentHandler,
  verifyPasswordResetHandler,
  verifyOtp,
  verifyTwoFactorLoginHandler,
} from "../controllers/user_controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.post("/signup", generalRateLimiter, signup);
router.post("/login", generalRateLimiter, login);
router.post("/auth/password-signup", generalRateLimiter, passwordSignup);
router.post("/auth/password-login", generalRateLimiter, passwordLogin);

router.post("/send-otp", otpSendRateLimiter, sendOtpHandler);

router.post("/verify-otp", verifyOtp);
router.post("/auth/2fa/verify-login", verifyTwoFactorLoginHandler);
router.post("/auth/forgot-password/request", otpSendRateLimiter, requestPasswordResetHandler);
router.post("/auth/forgot-password/verify", generalRateLimiter, verifyPasswordResetHandler);
router.post("/auth/forgot-password/reset", generalRateLimiter, resetPasswordHandler);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logout);

router.get("/sessions", requireAuth, getActiveSessions);
router.delete("/sessions/:sessionId", requireAuth, logoutSessionById);
router.post("/logout-all", requireAuth, logoutAllDevices);
router.get("/auth/2fa/status", requireAuth, getTwoFactorStatusHandler);
router.post("/auth/2fa/enroll/start", requireAuth, startTwoFactorEnrollmentHandler);
router.post("/auth/2fa/enroll/verify", requireAuth, enableTwoFactorEnrollmentHandler);
router.post("/auth/2fa/disable", requireAuth, disableTwoFactorHandler);
router.post("/auth/2fa/backup-codes/regenerate", requireAuth, regenerateBackupCodesHandler);
router.get("/auth/security-activity", requireAuth, getSecurityActivityHandler);
router.get("/auth/trusted-devices", requireAuth, getTrustedDevicesHandler);
router.delete("/auth/trusted-devices/:deviceId", requireAuth, revokeTrustedDeviceHandler);




export default router;
