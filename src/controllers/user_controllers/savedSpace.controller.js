import mongoose from "mongoose";
import SavedSpace from "../../models/user_models/SavedSpace.js";
import Space from "../../models/admin_models/Space.js";
import { fetchSpaceCardsByIds } from "../../services/space.service.js";
import {
  getCompanySpaceIds,
  getScopeOwnerId,
} from "../../services/spaceAccess.service.js";
import {
  getInventoryCategory,
  getInventoryCategoryLabel,
  isPhysicalVisitCategory,
} from "../../utils/marketplaceTaxonomy.js";

function normalizeId(value) {
  const id = String(value || "").trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

async function getAdminVisibleSpaceIds(user) {
  if (user?.role === "super_admin") return null;

  if (user?.companyId) {
    const ids = await getCompanySpaceIds(user);
    return ids.map((id) => String(id));
  }

  const ownerId = await getScopeOwnerId(user);
  const spaces = await Space.find({ owner: ownerId }).select("_id").lean();
  return spaces.map((space) => String(space._id));
}

async function attachCardPayload(savedItems, { includeUnpublished = false } = {}) {
  const cardIds = savedItems.map((item) => String(item.listingId?._id || item.listingId));
  const cards = await fetchSpaceCardsByIds(cardIds, { includeUnpublished });
  const cardMap = new Map(cards.map((card) => [String(card._id), card]));

  return savedItems.map((item) => {
    const plain = item.toObject ? item.toObject() : item;
    const listingId = String(plain.listingId?._id || plain.listingId);
    const listing = cardMap.get(listingId) || plain.listingId || null;
    const category = plain.category || getInventoryCategory(listing || {});

    return {
      ...plain,
      listing,
      category,
      categoryLabel: getInventoryCategoryLabel(category),
      visitEligible: isPhysicalVisitCategory(category),
    };
  });
}

export async function addToSavedSpaces(req, res) {
  try {
    const listingId = normalizeId(
      req.body?.listingId || req.body?.spaceId || req.body?.id,
    );

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: "listingId is required",
      });
    }

    const space = await Space.findOne({
      _id: listingId,
      isPublished: true,
    })
      .select("_id owner spaceType listingModes categories")
      .lean();

    if (!space) {
      return res.status(404).json({
        success: false,
        message: "Published space not found",
      });
    }

    const category = getInventoryCategory(space);

    let saved = await SavedSpace.findOne({
      userId: req.user._id,
      listingId,
    });

    let created = false;

    if (!saved) {
      saved = await SavedSpace.create({
        userId: req.user._id,
        listingId,
        category,
      });
      created = true;
      await Space.updateOne(
        { _id: listingId },
        { $inc: { "analytics.favorites": 1 } },
      );
    }

    const [item] = await attachCardPayload([saved]);

    return res.status(created ? 201 : 200).json({
      success: true,
      message: created ? "Added to My Shortlist" : "Already in My Shortlist",
      data: item,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "Already in My Shortlist",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function removeFromSavedSpaces(req, res) {
  try {
    const id = normalizeId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid saved space id or listing id is required",
      });
    }

    const deleted = await SavedSpace.findOneAndDelete({
      userId: req.user._id,
      $or: [{ _id: id }, { listingId: id }],
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Saved space not found",
      });
    }

    await Space.updateOne(
      { _id: deleted.listingId },
      { $inc: { "analytics.favorites": -1 } },
    );

    return res.json({
      success: true,
      message: "Removed from My Shortlist",
      data: { _id: deleted._id, listingId: deleted.listingId },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getMySavedSpaces(req, res) {
  try {
    const { category, city, q, page = 1, limit = 50 } = req.query;
    const filter = { userId: req.user._id };

    if (category && category !== "all") filter.category = category;

    const skip = (Math.max(Number(page), 1) - 1) * Math.max(Number(limit), 1);

    const [items, total] = await Promise.all([
      SavedSpace.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Math.min(Number(limit) || 50, 100)),
      SavedSpace.countDocuments(filter),
    ]);

    let data = await attachCardPayload(items);

    if (city && city !== "all") {
      const cityQuery = String(city).toLowerCase();
      data = data.filter((item) =>
        [
          item?.listing?.location?.cityName,
          item?.listing?.location?.addressLine,
          item?.listing?.location?.fullAddress,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(cityQuery),
      );
    }

    if (q) {
      const query = String(q).toLowerCase();
      data = data.filter((item) =>
        [
          item?.listing?.name,
          item?.listing?.location?.cityName,
          item?.listing?.location?.addressLine,
          item?.categoryLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    return res.json({
      success: true,
      total,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getSavedSpacesByUser(req, res) {
  try {
    const userId = normalizeId(req.params.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const visibleSpaceIds = await getAdminVisibleSpaceIds(req.user);
    const filter = { userId };

    if (Array.isArray(visibleSpaceIds)) {
      filter.listingId = { $in: visibleSpaceIds };
    }

    const items = await SavedSpace.find(filter).sort({ createdAt: -1 });
    const data = await attachCardPayload(items, { includeUnpublished: true });

    return res.json({
      success: true,
      total: data.length,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getAllSavedSpacesAdmin(req, res) {
  try {
    const {
      category,
      city,
      q,
      from,
      to,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    if (category && category !== "all") filter.category = category;

    const fromDate = parseDate(from);
    const toDate = parseDate(to, true);
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    const visibleSpaceIds = await getAdminVisibleSpaceIds(req.user);
    if (Array.isArray(visibleSpaceIds)) {
      if (!visibleSpaceIds.length) {
        return res.json({ success: true, total: 0, data: [] });
      }
      filter.listingId = { $in: visibleSpaceIds };
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const skip = (pageNumber - 1) * pageLimit;

    const [items, total] = await Promise.all([
      SavedSpace.find(filter)
        .populate("userId", "email username phoneNumber role isActive")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit),
      SavedSpace.countDocuments(filter),
    ]);

    let data = await attachCardPayload(items, { includeUnpublished: true });

    if (city && city !== "all") {
      const cityQuery = String(city).toLowerCase();
      data = data.filter((item) =>
        [
          item?.listing?.location?.cityName,
          item?.listing?.location?.addressLine,
          item?.listing?.location?.fullAddress,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(cityQuery),
      );
    }

    if (q) {
      const query = String(q).toLowerCase();
      data = data.filter((item) =>
        [
          item?.userId?.email,
          item?.userId?.username,
          item?.userId?.phoneNumber,
          item?.listing?.name,
          item?.listing?.location?.cityName,
          item?.categoryLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    return res.json({
      success: true,
      total,
      page: pageNumber,
      limit: pageLimit,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

