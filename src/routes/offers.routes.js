import express from "express";
import {
  listOffers,
  validateOffer,
  listAllOffers,
  redeemOfferController,
} from "../controllers/admin_controllers/offer.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";
import { requireSuperAdmin } from "../middlewares/superadmin.js";

const router = express.Router();

function spaceOffersDisabled(_req, res) {
  return res.status(410).json({
    success: false,
    message:
      "Space-specific offers are disabled. Use Super Admin Global Offers at /api/admin/marketplace-content/offers.",
  });
}

router.post(
  "/spaces/:spaceId/offers",
  requireAuth,
  requireSuperAdmin,
  requireAdminAccess,
  requirePermission("offers", "create"),
  spaceOffersDisabled,
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
  requireSuperAdmin,
  requireAdminAccess,
  requirePermission("offers", "update"),
  spaceOffersDisabled,
);
router.delete(
  "/spaces/:spaceId/offers/:offerId",
  requireAuth,
  requireSuperAdmin,
  requireAdminAccess,
  requirePermission("offers", "delete"),
  spaceOffersDisabled,
);


// preview (no auth optional)
router.post("/offers/validate", validateOffer);

// redeem - must be protected and called only after successful payment
router.post("/offers/redeem", requireAuth, redeemOfferController);

 
export default router;
