import mongoose from "mongoose";
import VisitRequest from "../../models/user_models/VisitRequest.js";
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

function clean(value) {
  return typeof value === "string" ? value.trim() : value;
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDayBoundary(value, endOfDay = false) {
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

async function attachListingPayload(items, { includeUnpublished = false } = {}) {
  const ids = items.map((item) => String(item.listingId?._id || item.listingId));
  const cards = await fetchSpaceCardsByIds(ids, { includeUnpublished });
  const cardMap = new Map(cards.map((card) => [String(card._id), card]));

  return items.map((item) => {
    const plain = item.toObject ? item.toObject() : item;
    const listingId = String(plain.listingId?._id || plain.listingId);
    const listing = cardMap.get(listingId) || plain.listingId || null;
    const category = plain.category || getInventoryCategory(listing || {});

    return {
      ...plain,
      listing,
      category,
      categoryLabel: getInventoryCategoryLabel(category),
    };
  });
}

export async function createVisitRequest(req, res) {
  try {
    const listingId = normalizeId(req.body?.listingId || req.body?.spaceId);
    const preferredDate = parseDate(req.body?.preferredDate);
    const preferredTime = clean(req.body?.preferredTime);
    const name = clean(req.body?.name || req.user?.username);
    const email = clean(req.body?.email || req.user?.email);
    const phoneNumber = clean(req.body?.phoneNumber || req.user?.phoneNumber);

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: "listingId is required",
      });
    }

    if (!preferredDate || !preferredTime || !name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "name, email, phoneNumber, preferredDate and preferredTime are required",
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

    if (!isPhysicalVisitCategory(category)) {
      return res.status(400).json({
        success: false,
        message: "Schedule Visit is available for physical spaces only.",
      });
    }

    if (req.user?._id) {
      const alreadySaved = await SavedSpace.exists({
        userId: req.user._id,
        listingId,
      });

      if (!alreadySaved) {
        await SavedSpace.create({
          userId: req.user._id,
          listingId,
          category,
        });
      }
    }

    const visit = await VisitRequest.create({
      userId: req.user?._id || null,
      listingId,
      ownerId: space.owner || null,
      category,
      visitType: clean(req.body?.visitType) || "guided_tour",
      preferredDate,
      preferredTime,
      name,
      email: String(email).toLowerCase(),
      phoneNumber,
      notes: clean(req.body?.notes) || "",
      whatsappUpdates: req.body?.whatsappUpdates !== false,
    });

    const [data] = await attachListingPayload([visit]);

    return res.status(201).json({
      success: true,
      message: "Space tour request submitted",
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getMyVisitRequests(req, res) {
  try {
    const items = await VisitRequest.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    const data = await attachListingPayload(items);

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

export async function adminGetVisitRequests(req, res) {
  try {
    const {
      category,
      city,
      status,
      q,
      from,
      to,
      page = 1,
      limit = 100,
    } = req.query;

    const filter = {};

    if (category && category !== "all") filter.category = category;
    if (status && status !== "all") filter.status = status;

    const fromDate = parseDayBoundary(from);
    const toDate = parseDayBoundary(to, true);
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
      VisitRequest.find(filter)
        .populate("userId", "email username phoneNumber role isActive")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit),
      VisitRequest.countDocuments(filter),
    ]);

    let data = await attachListingPayload(items, { includeUnpublished: true });

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
          item?.name,
          item?.email,
          item?.phoneNumber,
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

export async function updateVisitRequestStatus(req, res) {
  try {
    const id = normalizeId(req.params.id);
    const status = clean(req.body?.status);
    const allowed = ["new", "contacted", "scheduled", "completed", "cancelled"];

    if (!id || !allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid request id and status are required",
      });
    }

    const visibleSpaceIds = await getAdminVisibleSpaceIds(req.user);
    const filter = { _id: id };
    if (Array.isArray(visibleSpaceIds)) {
      filter.listingId = { $in: visibleSpaceIds };
    }

    const updated = await VisitRequest.findOneAndUpdate(
      filter,
      { status },
      { new: true },
    ).populate("userId", "email username phoneNumber role isActive");

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Visit request not found",
      });
    }

    const [data] = await attachListingPayload([updated], {
      includeUnpublished: true,
    });

    return res.json({
      success: true,
      message: "Visit request updated",
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
