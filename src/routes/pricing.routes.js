import express from "express";
import { createPricingPlan, deletePricingPlan, listAllPricingPlans, listPricingPlans, updatePricingPlan } from "../controllers/admin_controllers/pricing.controller.js";
import { requireAdminApproved, requireAuth,  } from "../middlewares/auth.js";

const router = express.Router();

// create / list are under space
router.post("/spaces/:spaceId/pricing-plans", createPricingPlan);

router.get("/pricing-plans", requireAuth, listAllPricingPlans);

router.get("/spaces/:spaceId/pricing-plans", listPricingPlans);

router.put("/spaces/:spaceId/pricing-plans/:planId", requireAuth, requireAdminApproved, updatePricingPlan);

router.delete("/spaces/:spaceId/pricing-plans/:planId", requireAuth, requireAdminApproved, deletePricingPlan);

export default router;
