import express from "express";
import { createPricingPlan, deletePricingPlan, listAllPricingPlans, listPricingPlans, updatePricingPlan } from "../controllers/admin_controllers/pricing.controller.js";
import {
  createMasterPlan,
  deleteMasterPlan,
  listMasterPlans,
  updateMasterPlan,
} from "../controllers/admin_controllers/masterPlan.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.get(
  "/master-plans",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "read"),
  listMasterPlans,
);

router.post(
  "/master-plans",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "create"),
  createMasterPlan,
);

router.put(
  "/master-plans/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "update"),
  updateMasterPlan,
);

router.delete(
  "/master-plans/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("pricing_plan", "delete"),
  deleteMasterPlan,
);

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
