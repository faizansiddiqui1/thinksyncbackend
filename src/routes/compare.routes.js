import express from "express";
import {
  createCompareSession,
  getCompareData,
  getCompareSession,
} from "../controllers/user_controllers/compare.controller.js";
import { optionalAuth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", getCompareData);
router.post("/", optionalAuth, createCompareSession);
router.get("/:id", optionalAuth, getCompareSession);

export default router;

