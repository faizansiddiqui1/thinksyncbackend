import express from "express";
import { createPricingPlan, deletePricingPlan, listAllPricingPlans, listPricingPlans, updatePricingPlan } from "../controllers/admin_controllers/pricing.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

// create / list are under space
router.post(
  "/spaces/:spaceId/pricing-plans",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "create"),
  createPricingPlan,
);

router.get(
  "/pricing-plans",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "read"),
  listAllPricingPlans,
);

router.get(
  "/spaces/:spaceId/pricing-plans",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "read"),
  listPricingPlans,
);

router.put(
  "/spaces/:spaceId/pricing-plans/:planId",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "update"),
  updatePricingPlan,
);

router.delete(
  "/spaces/:spaceId/pricing-plans/:planId",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "delete"),
  deletePricingPlan,
);

export default router;
