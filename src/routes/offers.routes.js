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
import {
  requireAdminAccess,
  requireAdminApproved,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/spaces/:spaceId/offers",
  requireAuth,
  requireAdminAccess,
  requirePermission("offers", "create"),
  createOffer,
);

router.get(
  "/spaces/:spaceId/offers",
  requireAuth,
  requireAdminAccess,
  requirePermission("offers", "read"),
  listOffers,
);

router.get(
  "/offers",
  requireAuth,
  requireAdminAccess,
  requirePermission("offers", "read"),
  listAllOffers,
);

router.put(
  "/spaces/:spaceId/offers/:offerId",
  requireAuth,
  requireAdminAccess,
  requirePermission("offers", "update"),
  updateOffer,
);
router.delete(
  "/spaces/:spaceId/offers/:offerId",
  requireAuth,
  requireAdminAccess,
  requirePermission("offers", "delete"),
  requireAdminApproved,
  deleteOffer,
);


// preview (no auth optional)
router.post("/offers/validate", validateOffer);

// redeem - must be protected and called only after successful payment
router.post("/offers/redeem", requireAuth, redeemOfferController);

 
export default router;
