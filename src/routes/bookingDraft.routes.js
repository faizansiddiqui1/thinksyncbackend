import express from "express";
import {
  cancelBookingDraft,
  checkoutBookingDraft,
  createBookingDraft,
  getActiveBookingDraft,
  getBookingDraft,
  listBookingDrafts,
  updateBookingDraft,
} from "../controllers/user_controllers/bookingDraft.controller.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/booking-drafts", optionalAuth, listBookingDrafts);
router.get("/booking-drafts/active", optionalAuth, getActiveBookingDraft);
router.post("/booking-drafts", optionalAuth, createBookingDraft);
router.get("/booking-drafts/:id", optionalAuth, getBookingDraft);
router.patch("/booking-drafts/:id", optionalAuth, updateBookingDraft);
router.post("/booking-drafts/:id/cancel", optionalAuth, cancelBookingDraft);
router.post("/booking-drafts/:id/checkout", requireAuth, checkoutBookingDraft);

export default router;
