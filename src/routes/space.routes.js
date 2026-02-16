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
  getSpaceById,
  getSpaceBySlug,
  updateSpace,
} from "../controllers/admin_controllers/space.controller.js";

const router = express.Router();

// Create a new space
router.post("/space-listing/", createSpace);

// Admin Panel Side For location
router.post("/property/reverse-location", reverseLocationController);
router.get("/property/autocomplete", autocompleteController);
router.get("/property/place-details", placeDetailsController);

// Customer side
router.get("/property/search", searchController);
router.get("/property/near", nearController);
router.get("/property/suggest", suggestController);

// Get all spaces (with query params for filtering/pagination)
router.get("/get-listing", getAllSpaces);

// ===================================================
// ⚠️ WARNING: Important Notes Slug or ID routes cannot have the same name
// ===================================================
router.get("/space/:slug", getSpaceBySlug);
router.get("/space/id/:id", getSpaceById);

// Update a space by ID
router.patch("/space/:id", updateSpace);

// Delete a space by ID
router.delete("/space/:id", deleteSpace);

export default router;
