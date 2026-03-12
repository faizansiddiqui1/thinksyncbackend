import express from "express";
import {
  reverseLocationController,
  autocompleteController,
  placeDetailsController,
} from "../controllers/admin_controllers/property.controller.js";

import {
  nearController,
  searchController,
  suggestController,
} from "../controllers/user_controllers/search.controller.js";

import {
  createSpace,
  deleteSpace,
  getAllSpaces,
  getFullSpaceById,
  getFullSpacesForOwner,
  getSpaceDetailsBySlug,
  getSpacesList,
  publishSpaceController,
  unpublishSpaceController,
  updateSpace,
} from "../controllers/admin_controllers/space.controller.js";
import {
  requireAdminAccess,
  requireAuth,
  requirePermission,
} from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/space-listing/",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "create"),
  createSpace,
);

router.get(
  "/get-listing",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  getAllSpaces,
);

router.get(
  "/admin/spaces/full",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  getFullSpacesForOwner,
);

router.get(
  "/space/:id/full",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  getFullSpaceById,
);

router.patch(
  "/space/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "update"),
  updateSpace,
);

router.delete(
  "/space/:id",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "delete"),
  deleteSpace,
);

router.post(
  "/space/:id/publish",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "create"),
  publishSpaceController,
);

router.post(
  "/space/:id/unpublish",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "create"),
  unpublishSpaceController,
);

router.post(
  "/property/reverse-location",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "create"),
  reverseLocationController,
);

router.get(
  "/property/autocomplete",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  autocompleteController,
);

router.get(
  "/property/place-details",
  requireAuth,
  requireAdminAccess,
  requirePermission("spaces", "read"),
  placeDetailsController,
);

// ===================================================
// Customer side
// ===================================================

router.get("/spaces", getSpacesList);
router.get("/space/:slug", getSpaceDetailsBySlug);


router.get("/property/search", searchController);
router.get("/property/near", nearController);
router.get("/property/suggest", suggestController);

export default router;
