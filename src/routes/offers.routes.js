import express from "express";
import {
  createOffer,
  listOffers,
  updateOffer,
  deleteOffer,
  validateOffer,
  listAllOffers,
} from "../controllers/admin_controllers/offer.controller.js";
import { requireAdminApproved, requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.post("/spaces/:spaceId/offers", createOffer);

router.get("/spaces/:spaceId/offers", listOffers);

router.get("/offers", listAllOffers);

router.put("/spaces/:spaceId/offers/:offerId", requireAuth, updateOffer);
router.delete("/spaces/:spaceId/offers/:offerId", requireAuth, requireAdminApproved, deleteOffer);

// validate / apply (returns computed discount but does not force booking)
router.post("/spaces/:spaceId/offers/validate", validateOffer);

export default router;
