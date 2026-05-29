import mongoose from "mongoose";
import CompareSession from "../../models/user_models/CompareSession.js";
import { fetchSpaceCardsByIds } from "../../services/space.service.js";
import {
  areComparableCategories,
  getInventoryCategory,
  getInventoryCategoryLabel,
} from "../../utils/marketplaceTaxonomy.js";

function normalizeIds(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim());

  return [
    ...new Set(raw.filter((id) => mongoose.Types.ObjectId.isValid(String(id)))),
  ].slice(0, 4);
}

function formatSpaceForCompare(space) {
  const category = getInventoryCategory(space);
  const pricing = space?.pricingSummary || {};
  const location = space?.location || {};

  return {
    ...space,
    category,
    categoryLabel: getInventoryCategoryLabel(category),
    comparison: {
      fullAddress: location.fullAddress || location.addressLine || "",
      openHours: Array.isArray(space?.operatingHours)
        ? space.operatingHours
            .filter((item) => item?.isOpen !== false)
            .map((item) => `${item.day}: ${item.openTime || "-"} - ${item.closeTime || "-"}`)
            .join(", ")
        : "",
      totalCenterArea:
        space?.centerDetails?.totalCenterArea ||
        pricing?.totalCenterArea ||
        space?.privateOfficeDetails?.floorSize ||
        null,
      totalSeats: space?.centerDetails?.totalSeats || pricing?.totalSeats || null,
      inventoryType: getInventoryCategoryLabel(category),
      seatTypes: Array.isArray(pricing?.seatTypes)
        ? pricing.seatTypes.map((item) => item?.label || item?.type).filter(Boolean)
        : [],
      features: Array.isArray(space?.amenities)
        ? space.amenities.map((item) => item?.label || item?.key).filter(Boolean)
        : [],
      price:
        pricing?.startingFrom ||
        pricing?.startingPrice ||
        pricing?.pricePerSqFt ||
        space?.startingPrice ||
        null,
      currency: pricing?.currency || space?.priceBreakup?.currency || "INR",
    },
  };
}

export async function generateComparePayload(listingIds) {
  const ids = normalizeIds(listingIds);

  if (ids.length < 2) {
    const error = new Error("Select at least two spaces to compare.");
    error.status = 400;
    throw error;
  }

  const spaces = (await fetchSpaceCardsByIds(ids)).map(formatSpaceForCompare);

  if (spaces.length !== ids.length) {
    const error = new Error("One or more spaces are unavailable for comparison.");
    error.status = 404;
    throw error;
  }

  const categories = spaces.map((space) => space.category);

  if (!areComparableCategories(categories)) {
    const error = new Error("Please compare spaces from the same category.");
    error.status = 400;
    throw error;
  }

  const category = categories[0];

  return {
    category,
    categoryLabel: getInventoryCategoryLabel(category),
    ids,
    spaces,
    rows: [
      { key: "fullAddress", label: "Full Address" },
      { key: "openHours", label: "Open Hours" },
      { key: "totalCenterArea", label: "Total Center Area" },
      { key: "totalSeats", label: "Total Seating Capacity" },
      { key: "inventoryType", label: "Inventory Type" },
      { key: "seatTypes", label: "Seat Types" },
      { key: "features", label: "Features" },
    ],
  };
}

export async function validateComparableItems(req, res) {
  return getCompareData(req, res);
}

export async function createCompareSession(req, res) {
  try {
    const listingIds = normalizeIds(req.body?.listingIds || req.body?.ids);
    const payload = await generateComparePayload(listingIds);

    const session = await CompareSession.create({
      userId: req.user?._id || null,
      listingIds: payload.ids,
      category: payload.category,
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: session._id,
        ...payload,
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getCompareData(req, res) {
  try {
    const ids = normalizeIds(req.query.ids || req.body?.ids || req.body?.listingIds);
    const payload = await generateComparePayload(ids);

    return res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

export async function getCompareSession(req, res) {
  try {
    const sessionId = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid compare session id",
      });
    }

    const session = await CompareSession.findById(sessionId).lean();

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Compare session not found",
      });
    }

    const payload = await generateComparePayload(session.listingIds);

    return res.json({
      success: true,
      data: {
        _id: session._id,
        ...payload,
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message,
    });
  }
}

