

// /controllers/space.controller.js

import Space from "../../models/admin_models/Space.js";
import {
  createSpace as serviceCreateSpace,
  getAllSpaces as serviceGetAllSpaces,
  updateSpace as serviceUpdateSpace,
  deleteSpace as serviceDeleteSpace,
  fetchSpacesListing as serviceFetchSpacesListing,
  fetchSpaceDetailsBySlug as serviceFetchSpaceDetailsBySlug,
  fetchSpacesListing
} from "../../services/space.service.js";


import Resource from "../../models/admin_models/ResourceSchema.js";
import PricingPlan from "../../models/admin_models/PricingPlan.js";
import Offer from "../../models/admin_models/Offer.js";
import * as mediaService from "../../services/spaceMedia.service.js";
import SpaceMedia from "../../models/admin_models/SpaceMedia.js";


export const createSpace = async (req, res) => {
  try {
    const space = await serviceCreateSpace(req.body, req.user?.id || null);
    if (!space) {
      // service did not return object (likely failed)
      return res
        .status(500)
        .json({ error: "Space creation failed (service returned empty)." });
    }
    return res.status(201).json({
      message: "Space created successfully!",
      data: space,
    });
  } catch (err) {
    console.error("[createSpace] error:", err);
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : String(err) });
  }
};

export const getFullSpaceById = async (req, res) => {
  try {
    const { id } = req.params;

    const space = await Space.findById(id).lean();
    if (!space) return res.status(404).json({ error: "Space not found" });

    const [resources, pricingPlans, offers, media] = await Promise.all([
      Resource.find({ space: id }).lean(),
      PricingPlan.find({ space: id }).lean(),
      Offer.find({ space: id }).lean(),
      mediaService.getMediaBySpace(id),
    ]);

    return res.json({
      data: {
        ...space,
        resources,
        pricingPlans,
        offers,
        media,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getFullSpacesForOwner = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const spaces = await Space.find({ owner: ownerId }).lean();
    if (!spaces.length) return res.json({ items: [] });

    const ids = spaces.map(s => s._id);

    const [resources, pricingPlans, offers, medias] = await Promise.all([
      Resource.find({ space: { $in: ids } }).lean(),
      PricingPlan.find({ space: { $in: ids } }).lean(),
      Offer.find({ space: { $in: ids } }).lean(),
      SpaceMedia.find({ space: { $in: ids } }).lean(),
    ]);

    const group = (arr, key) => {
      const m = new Map();
      arr.forEach(i => {
        const k = String(i[key]);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(i);
      });
      return m;
    };

    const resMap = group(resources, "space");
    const planMap = group(pricingPlans, "space");
    const offerMap = group(offers, "space");
    const mediaMap = new Map(medias.map(m => [String(m.space), m]));

    const items = spaces.map(s => ({
      ...s,
      resources: resMap.get(String(s._id)) || [],
      pricingPlans: planMap.get(String(s._id)) || [],
      offers: offerMap.get(String(s._id)) || [],
      media: mediaMap.get(String(s._id)) || { images: [], video: null },
    }));

    res.json({ items });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const publishSpaceController = async (req, res) => {
  try {
    const space = await Space.findById(req.params.id);

    if (!space) {
      return res.status(404).json({ message: "Space not found" });
    }

    // optional validation before publish
    if (!space.name || !space.address?.city) {
      return res.status(400).json({
        message: "Space incomplete. Fill required fields before publishing.",
      });
    }

    space.status = "PUBLISHED";
    space.isPublished = true;

    await space.save();

    return res.json({
      success: true,
      message: "Space published successfully",
      data: space,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const unpublishSpaceController = async (req, res) => {
  const space = await Space.findById(req.params.id);
  if (!space) return res.status(404).json({ message: "Not found" });

  space.status = "DRAFT";
  space.isPublished = false;

  await space.save();

  res.json({ success: true, data: space });
};

export const getAllSpaces = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const spaces = await serviceGetAllSpaces(req.query, {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      ownerId: req.user?.id,
    });

    return res.status(200).json({
      message: "Spaces retrieved successfully!",
      data: spaces,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message || "Error retrieving spaces.",
    });
  }
};

export const updateSpace = async (req, res) => {
  try {
    const space = await serviceUpdateSpace(
      req.params.id,
      req.body,
      req.user?.id,
    );
    return res.status(200).json({
      message: "Space updated successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "An error occurred while updating the space.",
    });
  }
};

export const deleteSpace = async (req, res) => {
  try {
    const space = await serviceDeleteSpace(req.params.id);
    return res.status(200).json({
      message: "Space deleted successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(404).json({
      message: error.message || "An error occurred while deleting the space.",
    });
  }
};


// ===================================================
// User side 
// ===================================================

export const getSpacesList = async (req, res) => {
  try {
    const query = {
      page: req.query.page,
      limit: req.query.limit,
      city: req.query.city,
      spaceType: req.query.spaceType,
      featured: req.query.featured,
      search: req.query.search,
      sort: req.query.sort,
    };

    const result = await serviceFetchSpacesListing(query);

    // CDN cache (optional)
    res.set("Cache-Control", "public, max-age=30, s-maxage=60");

    return res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  } catch (err) {
    console.error("[getSpacesList]", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const getSpaceDetailsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== "string") {
      return res.status(400).json({ success: false, error: "Invalid slug" });
    }

    const space = await serviceFetchSpaceDetailsBySlug(slug);

    return res.status(200).json({
      success: true,
      data: space,
    });
  } catch (err) {
    console.error("[getSpaceDetailsBySlug] ", err);
    // 404 for not found, 500 for other errors
    if (err.message && /not found/i.test(err.message)) {
      return res.status(404).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
};


