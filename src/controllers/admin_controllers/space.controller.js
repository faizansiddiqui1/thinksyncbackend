// /controllers/space.controller.js

import Space from "../../models/admin_models/Space.js";
import {
  createSpace as serviceCreateSpace,
  getAllSpaces as serviceGetAllSpaces,
  updateSpace as serviceUpdateSpace,
  deleteSpace as serviceDeleteSpace,
  fetchSpacesListing as serviceFetchSpacesListing,
  fetchSpacesListing,
  fetchSpaceDetailsBySlug,
} from "../../services/space.service.js";

import Resource from "../../models/admin_models/ResourceSchema.js";
import PricingPlan from "../../models/admin_models/PricingPlan.js";
import Offer from "../../models/admin_models/Offer.js";
import SpaceMedia from "../../models/admin_models/SpaceMedia.js";
import VirtualOfficePlan from "../../models/admin_models/VirtualOfficePlan.js";
import EventSpace from "../../models/admin_models/EventSpace.js";
import Addon from "../../models/admin_models/AddonSchema.js";
import * as mediaService from "../../services/spaceMedia.service.js";
import {
  ensureSpaceAccess,
  getScopeOwnerId,
  getCompanySpaceIds,
} from "../../services/spaceAccess.service.js";

function isCompanyWorkspaceActor(user) {
  return Boolean(user?.companyId);
}

export const createSpace = async (req, res) => {
  try {
    if (isCompanyWorkspaceActor(req.user)) {
      return res.status(403).json({
        error:
          "Company admins can only manage assigned spaces. Listing creation is disabled.",
      });
    }

    const tenant = req.context?.tenant || null;

    const space = await serviceCreateSpace(
      req.body,
      req.user?.id || null,
      tenant,
    );
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
    const tenant = req.context?.tenant || req.tenant || null;

    const spaceDoc = await ensureSpaceAccess(id, req.user);
    const space = await Space.findById(spaceDoc._id)
      .populate("address.city", "name slug")
      .lean();

    if (!space) {
      return res.status(404).json({
        error: "Space not found",
      });
    }

    const [
      resources,
      pricingPlans,
      offers,
      media,
      virtualOfficePlans,
      eventSpace,
      addons,
    ] =
      await Promise.all([
        Resource.find({ space: id }).lean(),

        PricingPlan.find({ space: id }).lean(),

        Offer.find({ space: id }).lean(),

        mediaService.getMediaBySpace(id, tenant),

        VirtualOfficePlan.find({
          space: id,
          isActive: true,
        }).lean(),

        EventSpace.findOne({
          space: id,
          isActive: true,
        }).lean(),

        Addon.find({
          space: id,
          isActive: true,
        })
          .sort({ displayOrder: 1, createdAt: -1 })
          .lean(),
      ]);

    return res.json({
      data: {
        ...space,

        resources,

        pricingPlans,

        offers,

        virtualOfficePlans,

        eventSpace,

        addons,

        media,
      },
    });
  } catch (err) {
    console.error(err);

    return res.status(err.status || 500).json({
      error: err.message,
    });
  }
};

export const getFullSpacesForOwner = async (req, res) => {
  try {
    const isSuperAdmin = req.user?.role === "super_admin";
    const query = {};

    if (req.user?.companyId) {
      const companySpaceIds = await getCompanySpaceIds(req.user);
      if (!companySpaceIds?.length) {
        return res.json({ items: [] });
      }
      query._id = { $in: companySpaceIds };
    } else if (!isSuperAdmin) {
      query.owner = await getScopeOwnerId(req.user);
    } else if (req.query.ownerId) {
      query.owner = req.query.ownerId;
    }

    if (req.query.status === "DRAFT") {
      query.isPublished = false;
    } else if (req.query.status === "PUBLISHED") {
      query.isPublished = true;
    }

    const spaces = await Space.find(query)
      .populate("address.city", "name slug")
      .lean();

    if (!spaces.length) {
      return res.json({ items: [] });
    }

    const ids = spaces.map((s) => s._id);

    const [
      resources,
      pricingPlans,
      offers,
      medias,
      virtualOfficePlans,
      eventSpaces,
      addons,
    ] =
      await Promise.all([
        Resource.find({ space: { $in: ids } }).lean(),

        PricingPlan.find({ space: { $in: ids } }).lean(),

        Offer.find({ space: { $in: ids } }).lean(),

        SpaceMedia.find({ space: { $in: ids } }).lean(),

        VirtualOfficePlan.find({
          space: { $in: ids },
          isActive: true,
        }).lean(),

        EventSpace.find({
          space: { $in: ids },
          isActive: true,
        }).lean(),

        Addon.find({
          space: { $in: ids },
          isActive: true,
        })
          .sort({ displayOrder: 1, createdAt: -1 })
          .lean(),
      ]);

    const group = (arr, key) => {
      const m = new Map();

      arr.forEach((i) => {
        const k = String(i[key]);

        if (!m.has(k)) {
          m.set(k, []);
        }

        m.get(k).push(i);
      });

      return m;
    };

    const resMap = group(resources, "space");

    const planMap = group(pricingPlans, "space");

    const offerMap = group(offers, "space");

    const virtualOfficeMap = group(virtualOfficePlans, "space");

    const eventSpaceMap = new Map(
      eventSpaces.map((item) => [String(item.space), item]),
    );

    const addonMap = group(addons, "space");

    const mediaMap = new Map(medias.map((m) => [String(m.space), m]));

    const items = spaces.map((s) => ({
      ...s,

      resources: resMap.get(String(s._id)) || [],

      pricingPlans: planMap.get(String(s._id)) || [],

      offers: offerMap.get(String(s._id)) || [],

      virtualOfficePlans: virtualOfficeMap.get(String(s._id)) || [],

      eventSpace: eventSpaceMap.get(String(s._id)) || null,

      addons: addonMap.get(String(s._id)) || [],

      media: mediaMap.get(String(s._id)) || {
        images: [],
        video: null,
      },
    }));

    return res.json({ items });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
};

export const publishSpaceController = async (req, res) => {
  try {
    if (isCompanyWorkspaceActor(req.user)) {
      return res.status(403).json({
        message:
          "Company admins cannot publish marketplace listings.",
      });
    }

    const space = await ensureSpaceAccess(req.params.id, req.user);

    if (!space) {
      return res.status(404).json({ message: "Space not found" });
    }

    // optional validation before publish
    if (!space.name || !space.address?.city) {
      return res.status(400).json({
        message: "Space incomplete. Fill required fields before publishing.",
      });
    }

    const normalizedType = String(space.spaceType || "").toLowerCase();
    const isLongTerm =
      space.listingModes?.longTerm === true ||
      String(space.leasingType || "").toLowerCase() === "long_term";
    const requiresResources =
      (normalizedType === "cowork_space" ||
        normalizedType === "coworking_space") &&
      !isLongTerm;

    if (requiresResources) {
      const resources = await Resource.find({ space: space._id }).select("name images").lean();

      if (!resources.length) {
        return res.status(400).json({
          message: "Add at least 1 resource before publishing.",
        });
      }

      const resourceWithoutImage = resources.find(
        (resource) =>
          !Array.isArray(resource.images) ||
          !resource.images.some((image) => image?.url || image?.s3Key),
      );

      if (resourceWithoutImage) {
        return res.status(400).json({
          message: `${resourceWithoutImage.name || "Resource"} needs at least 1 image before publishing.`,
        });
      }
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
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const unpublishSpaceController = async (req, res) => {
  try {
    if (isCompanyWorkspaceActor(req.user)) {
      return res.status(403).json({
        message:
          "Company admins cannot change public publishing controls.",
      });
    }

    const space = await ensureSpaceAccess(req.params.id, req.user);
    if (!space) return res.status(404).json({ message: "Not found" });

    space.status = "DRAFT";
    space.isPublished = false;

    await space.save();

    res.json({ success: true, data: space });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }
};

export const getAllSpaces = async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const ownerId = req.user?.role === "super_admin" ? null : await getScopeOwnerId(req.user);
    const spaceIds = req.user?.companyId ? await getCompanySpaceIds(req.user) : null;

    const spaces = await serviceGetAllSpaces(req.query, {
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 1,
      ownerId,
      spaceIds,
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
    if (isCompanyWorkspaceActor(req.user)) {
      return res.status(403).json({
        message:
          "Company admins cannot edit marketplace listing details.",
      });
    }

    await ensureSpaceAccess(req.params.id, req.user);

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
    return res.status(error.status || 400).json({
      message: error.message || "An error occurred while updating the space.",
    });
  }
};

export const deleteSpace = async (req, res) => {
  try {
    if (isCompanyWorkspaceActor(req.user)) {
      return res.status(403).json({
        message:
          "Company admins cannot delete marketplace listings.",
      });
    }

    await ensureSpaceAccess(req.params.id, req.user);
    const tenant = req.context?.tenant || req.tenant || null;
    const space = await serviceDeleteSpace(req.params.id, tenant);
    return res.status(200).json({
      message: "Space deleted successfully!",
      data: space,
    });
  } catch (error) {
    return res.status(error.status || 404).json({
      message: error.message || "An error occurred while deleting the space.",
    });
  }
};

// ===================================================
// User side
// ===================================================

// Get space list only for space card based filtered data
export const getSpacesList = async (req, res) => {
  try {
    console.log("Runned Space list");

    const query = {
      page: req.query.page,
      limit: req.query.limit,
      city: req.query.city,
      spaceType: req.query.spaceType,
      featured: req.query.featured,
      search: req.query.search,
      sort: req.query.sort,
      longTerm: req.query.longTerm,
      shortTerm: req.query.shortTerm, // add this
    };

    const result = await serviceFetchSpacesListing(query);

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

// Get space full data by slug for details page
export const getSpaceDetailsBySlug = async (req, res) => {
  try {
    console.log("runned get space slug");

    const { slug } = req.params;

    if (!slug || typeof slug !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid slug",
      });
    }

    const data = await fetchSpaceDetailsBySlug(slug, req.user || null);

    res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("[getSpaceDetailsBySlug]", err);

    if (err.message && /not found/i.test(err.message)) {
      return res.status(404).json({
        success: false,
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }
};  

// Super admin
export const searchSpacesController = async (req, res) => {
  try {
    const { q = "" } = req.query;

    let filter = {};

    // 🔥 role-based filtering
    if (req.user.role !== "super_admin") {
      if (req.user?.companyId) {
        const companySpaceIds = await getCompanySpaceIds(req.user);
        filter._id = { $in: companySpaceIds };
      } else {
        filter.owner = await getScopeOwnerId(req.user);
      }
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
        { spaceType: { $regex: q, $options: "i" } },
      ];
    }

    const spaces = await Space.find(filter)
      .select("name spaceType slug privateOfficeDetails")
      .limit(20)
      .lean();

    return res.json({
      success: true,
      items: spaces,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
