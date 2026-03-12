import express from 'express';
import { handleWebhook } from '../webhooks/cashfreeWebhook.js';
const router = express.Router();

// Cashfree will POST here for async updates (ensure HTTPS in prod)
router.post('/webhook/cashfree', express.json(), handleWebhook);

export default router;
