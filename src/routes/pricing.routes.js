import express from "express";
import { createPricingPlan, deletePricingPlan, listPricingPlans, updatePricingPlan } from "../controllers/admin_controllers/pricing.controller.js";
import { requireAdminApproved, requireAuth,  } from "../middlewares/auth.js";

const router = express.Router();

// create / list are under space
router.post("/spaces/:spaceId/pricing-plans", createPricingPlan);

// router.post("/spaces/:spaceId/pricing-plans", requireAuth, requireRole(["admin", "super_admin"]), requireAdminApproved, createPricingPlan);


router.get("/spaces/:spaceId/pricing-plans", listPricingPlans);

// update / delete by plan id (spaceId in URL keeps it explicit)
router.put("/spaces/:spaceId/pricing-plans/:planId", requireAuth, requireAdminApproved, updatePricingPlan);
router.delete("/spaces/:spaceId/pricing-plans/:planId", requireAuth, requireAdminApproved, deletePricingPlan);

export default router;
