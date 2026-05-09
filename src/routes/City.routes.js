// City.routes.js

import express from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";
import { createCity, getCities } from "../controllers/super_admin_controllers/City.controller.js";

const router = express.Router();

router.post("/addCity", requireAuth, requireSuperAdmin, createCity);
router.get("/getCity", getCities);

export default router;