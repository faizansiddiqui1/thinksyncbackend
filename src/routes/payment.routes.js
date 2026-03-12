// src/routes/payment.routes.js
import express from "express";
import {
  CreatePayment,
  SignatureVerificationWebHook,
} from "../controllers/admin_controllers/payment.controller.js";

const router = express.Router();

router.post("/payments", CreatePayment);

router.post(
  "/payments/webhook",
  SignatureVerificationWebHook,
);
export default router;
