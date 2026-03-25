import express from "express";
import {
  createOffer,
  listOffers,
  updateOffer,
  deleteOffer,
  validateOffer,
  listAllOffers,
  redeemOfferController,
} from "../controllers/admin_controllers/offer.controller.js";
import { requireAdminApproved, requireAuth } from "../middlewares/auth.js";

const router = express.Router();

router.post("/spaces/:spaceId/offers", createOffer);

router.get("/spaces/:spaceId/offers", listOffers);

router.get("/offers", listAllOffers);

router.put("/spaces/:spaceId/offers/:offerId", requireAuth, updateOffer);
router.delete("/spaces/:spaceId/offers/:offerId", requireAuth, requireAdminApproved, deleteOffer);


// preview (no auth optional)
router.post("/offers/validate", validateOffer);

// redeem - must be protected and called only after successful payment
router.post("/offers/redeem", requireAuth, redeemOfferController);

 
export default router;
