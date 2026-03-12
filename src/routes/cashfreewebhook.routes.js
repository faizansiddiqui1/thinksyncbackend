import express from "express";

import { cashfreeWebhook } from "../controllers/user_controllers/cashfreeWebhook.controller.js";

const router = express.Router();

router.post(
  "/payments/cashfree/webhook",
  express.raw({ type: "application/json" }),
  cashfreeWebhook,
);

export default router;
