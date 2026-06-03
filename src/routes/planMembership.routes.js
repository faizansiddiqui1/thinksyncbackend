import express from "express";
import {
  createPlanReservation,
  listAdminPlanPurchases,
  getMyPlans,
  getPlanAnalytics,
  purchasePlan,
} from "../controllers/user_controllers/planMembership.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.post("/purchase", requireAuth, purchasePlan);
router.get("/me", requireAuth, getMyPlans);
router.post("/reservations", requireAuth, createPlanReservation);

router.get(
  "/admin/analytics",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "read"),
  getPlanAnalytics,
);

router.get(
  "/admin/purchases",
  requireAuth,
  requireAdminAccess,
  requirePermission("booking", "read"),
  listAdminPlanPurchases,
);

export default router;
