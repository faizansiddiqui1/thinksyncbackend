import mongoose from "mongoose";
import Offer from "../models/admin_models/Offer.js";
import Space from "../models/admin_models/Space.js";
import CouponRedemption from "../models/admin_models/CouponRedemption.js";
import Booking from "../models/user_models/Booking.js";

const ensureSpace = async (spaceId) => {
  if (!mongoose.Types.ObjectId.isValid(spaceId))
    throw new Error("Invalid space id");
  const s = await Space.findById(spaceId).select("_id").lean();
  if (!s) throw new Error("Space not found");
  return s;
};

export const createOffer = async (spaceId, data, userId = null) => {
  await ensureSpace(spaceId);

  if (!data.code) throw new Error("Offer code is required");
  if (!data.discountType) throw new Error("discountType is required");
  if (
    data.discountType === "percentage" &&
    (data.discountValue <= 0 || data.discountValue > 100)
  )
    throw new Error("percentage discountValue must be between 0 and 100");
  if (new Date(data.validFrom) >= new Date(data.validTill))
    throw new Error("validFrom must be before validTill");

  // unique code per space or global? model has unique globally; ensure uniqueness for this space (better UX)
  const existing = await Offer.findOne({
    code: data.code,
    space: spaceId,
    isActive: true,
  }).lean();
  if (existing) throw new Error("Offer code already exists for this space");

  const offer = await Offer.create({
    space: spaceId,
    code: data.code.toUpperCase().trim(),
    title: data.title,
    description: data.description || "",
    discountType: data.discountType,
    discountValue: data.discountValue,
    minBookingAmount: data.minBookingAmount ?? 0,
    maxDiscountAmount: data.maxDiscountAmount ?? null,
    validFrom: data.validFrom,
    validTill: data.validTill,
    applicablePlanTypes: data.applicablePlanTypes,
    firstTimeUserOnly: !!data.firstTimeUserOnly,
    perUserUsageLimit: data.perUserUsageLimit ?? 1,
    totalUsageLimit: data.totalUsageLimit ?? null,
    usedCount: 0,
    stackable: !!data.stackable,
    isActive: data.isActive === undefined ? true : !!data.isActive,
    createdBy: userId,
    updatedBy: userId,
  });

  return offer.toObject ? offer.toObject() : offer;
};

export const listOffers = async (spaceId) => {
  await ensureSpace(spaceId);
  const offers = await Offer.find({ space: spaceId })
    .sort({ validTill: 1, createdAt: -1 })
    .lean()
    .exec();
  return offers;
};

export const listAllOffers = async () => {
  const offers = await Offer.find()
    .populate("space", "name") // optional (space name show karne ke liye)
    .sort({ validTill: 1, createdAt: -1 })
    .lean()
    .exec();

  return offers;
};

export const updateOffer = async (spaceId, offerId, data, userId = null) => {
  await ensureSpace(spaceId);

  if (!mongoose.Types.ObjectId.isValid(offerId))
    throw new Error("Invalid offer id");

  const offer = await Offer.findOne({ _id: offerId, space: spaceId });
  if (!offer) return null;

  if (data.code && data.code !== offer.code) {
    const exists = await Offer.findOne({
      code: data.code.toUpperCase().trim(),
      space: spaceId,
      isActive: true,
    });
    if (exists)
      throw new Error(
        "Another active offer with this code exists for this space",
      );
    offer.code = data.code.toUpperCase().trim();
  }

  if (
    data.validFrom &&
    data.validTill &&
    new Date(data.validFrom) >= new Date(data.validTill)
  )
    throw new Error("validFrom must be before validTill");

  const allowed = [
    "title",
    "description",
    "discountType",
    "discountValue",
    "minBookingAmount",
    "maxDiscountAmount",
    "validFrom",
    "validTill",
    "applicablePlanTypes",
    "firstTimeUserOnly",
    "perUserUsageLimit",
    "totalUsageLimit",
    "stackable",
    "isActive",
  ];
  for (const k of allowed) {
    if (data[k] !== undefined) offer[k] = data[k];
  }

  offer.updatedBy = userId;
  await offer.save();
  return offer.toObject ? offer.toObject() : offer;
};

export const deleteOffer = async (spaceId, offerId, userId = null) => {
  await ensureSpace(spaceId);
  if (!mongoose.Types.ObjectId.isValid(offerId))
    throw new Error("Invalid offer id");

  const offer = await Offer.findOne({ _id: offerId, space: spaceId });
  if (!offer) return null;

  offer.isActive = false;
  offer.updatedBy = userId;
  await offer.save();
  return true;
};

/**
 * Read-only validation + discount calculation for UI preview.
 * DOES NOT modify DB.
 */
export const validateOfferPreview = async ({
  spaceId,
  code,
  userId,
  planType,
  bookingAmount,
}) => {
  if (!code) throw new Error("Offer code is required");
  if (bookingAmount == null || isNaN(Number(bookingAmount)))
    throw new Error("bookingAmount is required");

  const now = new Date();
  const codeUp = code.toUpperCase().trim();

  // find offer that either belongs to space or is global (space null/undefined)
  const offer = await Offer.findOne({
    code: codeUp,
    isActive: true,
    $or: [{ space: spaceId }, { space: { $exists: false } }, { space: null }],
  });

  if (!offer) throw new Error("Offer not found");

  if (new Date(offer.validFrom) > now || new Date(offer.validTill) < now)
    throw new Error("Offer is not valid at this time");

  if (bookingAmount < (offer.minBookingAmount || 0))
    throw new Error(
      `Minimum booking amount for this offer is ${offer.minBookingAmount}`,
    );

  if (offer.applicablePlanTypes && offer.applicablePlanTypes.length) {
    if (!planType) throw new Error("planType is required for this offer");
    if (!offer.applicablePlanTypes.includes(planType))
      throw new Error("Offer not applicable for this plan type");
  }

  if (offer.totalUsageLimit != null && offer.usedCount >= offer.totalUsageLimit)
    throw new Error("Offer usage limit reached");

  // first time user check: read-only preview uses Booking collection
  if (offer.firstTimeUserOnly && userId) {
    const priorBookings = await Booking.countDocuments({ userId }).exec();
    if (priorBookings > 0)
      throw new Error("Offer valid for first-time users only");
  }

  // per-user usage check (read-only)
  if (offer.perUserUsageLimit != null && userId) {
    const usedByUser = await CouponRedemption.countDocuments({
      offer: offer._id,
      user: userId,
    }).exec();
    if (usedByUser >= offer.perUserUsageLimit)
      throw new Error("You have exceeded the usage limit for this offer");
  }

  // calculate discount
  let discount = 0;
  if (offer.discountType === "percentage") {
    discount = (Number(bookingAmount) * Number(offer.discountValue)) / 100;
    if (offer.maxDiscountAmount != null)
      discount = Math.min(discount, Number(offer.maxDiscountAmount));
  } else {
    discount = Number(offer.discountValue);
  }
  discount = Math.round((discount + Number.EPSILON) * 100) / 100;
  const finalAmount = Math.max(0, Number(bookingAmount) - discount);

  return {
    offer: {
      id: offer._id,
      code: offer.code,
      title: offer.title,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      maxDiscountAmount: offer.maxDiscountAmount,
      stackable: offer.stackable,
    },
    discountAmount: discount,
    finalAmount,
    stackable: !!offer.stackable,
  };
};

/**
 * Redeem the offer — writes DB (create redemption + increment usedCount)
 * Call THIS only after payment confirmed (payment verify webhook or verify endpoint).
 * Uses transaction to avoid races.
 */
export const redeemOffer = async ({
  offerCode,
  userId,
  spaceId,
  bookingAmount,
  bookingRef /* e.g. internalBookingId or bookingId */,
}) => {
  if (!offerCode) throw new Error("offerCode required");
  if (!userId) throw new Error("userId required");
  if (bookingAmount == null || isNaN(Number(bookingAmount)))
    throw new Error("bookingAmount required");

  const codeUp = offerCode.toUpperCase().trim();

  // load offer with a "for update" pattern in transaction
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Find the offer document inside the session
    const offer = await Offer.findOne({
      code: codeUp,
      isActive: true,
      $or: [{ space: spaceId }, { space: { $exists: false } }, { space: null }],
    }).session(session);

    if (!offer) throw new Error("Offer not found");

    const now = new Date();
    if (new Date(offer.validFrom) > now || new Date(offer.validTill) < now)
      throw new Error("Offer expired");

    if (bookingAmount < (offer.minBookingAmount || 0))
      throw new Error("Booking amount below minimum for offer");

    if (
      offer.totalUsageLimit != null &&
      offer.usedCount >= offer.totalUsageLimit
    )
      throw new Error("Offer usage limit reached");

    // firstTimeUserOnly check against Booking collection (best)
    if (offer.firstTimeUserOnly) {
      const priorBookings = await Booking.countDocuments({ userId }).session(session);

      if (priorBookings > 0)
        throw new Error("Offer valid for first-time users only");
    }

    if (offer.perUserUsageLimit != null) {
      const usedByUser = await CouponRedemption.countDocuments({
        offer: offer._id,
        user: userId,
      }).session(session);
      if (usedByUser >= offer.perUserUsageLimit)
        throw new Error("You have exceeded the usage limit for this offer");
    }

    // compute discount
    let discount = 0;
    if (offer.discountType === "percentage") {
      discount = (Number(bookingAmount) * Number(offer.discountValue)) / 100;
      if (offer.maxDiscountAmount != null)
        discount = Math.min(discount, Number(offer.maxDiscountAmount));
    } else {
      discount = Number(offer.discountValue);
    }
    discount = Math.round((discount + Number.EPSILON) * 100) / 100;
    const finalAmount = Math.max(0, Number(bookingAmount) - discount);

    // Create redemption record
    const redemption = await CouponRedemption.create(
      [
        {
          offer: offer._id,
          user: userId,
          space: spaceId,
          amountAtBooking: Number(bookingAmount),
          discountGiven: discount,
          bookingRef: bookingRef || null,
          createdBy: userId,
        },
      ],
      { session },
    );

    // increment usedCount atomically
    offer.usedCount = (offer.usedCount || 0) + 1;
    await offer.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      redemption: redemption[0],
      discount,
      finalAmount,
      offerId: offer._id,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
