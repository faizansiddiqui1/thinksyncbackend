import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import {
  addEmployee,
  createCompany,
  listAssignableOnboardingCities,
  listAssignableOnboardingSpaces,
  listOnboardedCompanies,
} from "../controllers/super_admin_controllers/company.controller.js";

const router = express.Router();

router.get("/", requireAuth, requireSuperAdmin, listOnboardedCompanies);
router.get("/spaces", requireAuth, requireSuperAdmin, listAssignableOnboardingSpaces);
router.get("/cities", requireAuth, requireSuperAdmin, listAssignableOnboardingCities);

// 🔒 Only super admin can create company
router.post("/", requireAuth, requireSuperAdmin, createCompany);

router.post("/addEmployee", requireAuth, addEmployee);

export default router;
