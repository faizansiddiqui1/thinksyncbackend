import mongoose from "mongoose";
import Offer from "../models/admin_models/Offer.js";
import MarketplaceContent from "../models/super_admin_models/MarketplaceContent.js";
import CouponRedemption from "../models/admin_models/CouponRedemption.js";
import Booking from "../models/user_models/Booking.js";
import {
  ensureSpaceAccess,
  getOwnedSpaceIds,
  isSuperAdminUser,
} from "./spaceAccess.service.js";

async function findOfferByCode(codeUp, session = null) {
  const platformQuery = MarketplaceContent.findOne({
    type: "offers",
    code: codeUp,
    isActive: true,
    deletedAt: null,
  });

  if (session) platformQuery.session(session);
  const platformOffer = await platformQuery;
  if (platformOffer) return { offer: platformOffer, source: "platform" };

  return { offer: null, source: "" };
}

function assertOfferValidity(offer, now = new Date()) {
  const validFrom = offer.validFrom ? new Date(offer.validFrom) : null;
  const validTill = offer.validTill ? new Date(offer.validTill) : null;

  if (validFrom && validFrom > now) throw new Error("Offer is not valid at this time");
  if (validTill && validTill < now) throw new Error("Offer is not valid at this time");
}

function calculateDiscount(offer, bookingAmount) {
  let discount = 0;
  if (offer.discountType === "percentage") {
    discount = (Number(bookingAmount) * Number(offer.discountValue)) / 100;
    if (offer.maxDiscountAmount != null)
      discount = Math.min(discount, Number(offer.maxDiscountAmount));
  } else if (offer.discountType === "flat") {
    discount = Number(offer.discountValue);
  } else {
    discount = 0;
  }

  return Math.round((discount + Number.EPSILON) * 100) / 100;
}

function isFirstTimeOnly(offer) {
  return Boolean(offer.firstTimeUserOnly || offer.firstBookingOnly);
}

export const listOffers = async (spaceId, user = null) => {
  await ensureSpaceAccess(spaceId, user);
  const offers = await Offer.find({ space: spaceId })
    .sort({ validTill: 1, createdAt: -1 })
    .lean()
    .exec();
  return offers;
};

export const listAllOffers = async (user = null) => {
  const query = {};

  if (!isSuperAdminUser(user)) {
    const spaceIds = await getOwnedSpaceIds(user);
    if (!spaceIds?.length) {
      return [];
    }

    query.space = { $in: spaceIds };
  }

  const offers = await Offer.find(query)
    .populate("space", "name slug owner status isPublished")
    .sort({ validTill: 1, createdAt: -1 })
    .lean()
    .exec();

  return offers;
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

  const { offer, source } = await findOfferByCode(codeUp);

  if (!offer) throw new Error("Offer not found");

  assertOfferValidity(offer, now);

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
  if (isFirstTimeOnly(offer) && userId) {
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

  const discount = calculateDiscount(offer, bookingAmount);
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
      source,
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
    const { offer, source } = await findOfferByCode(codeUp, session);

    if (!offer) throw new Error("Offer not found");

    const now = new Date();
    assertOfferValidity(offer, now);

    if (bookingAmount < (offer.minBookingAmount || 0))
      throw new Error("Booking amount below minimum for offer");

    if (
      offer.totalUsageLimit != null &&
      offer.usedCount >= offer.totalUsageLimit
    )
      throw new Error("Offer usage limit reached");

    // firstTimeUserOnly check against Booking collection (best)
    if (isFirstTimeOnly(offer)) {
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

    const discount = calculateDiscount(offer, bookingAmount);
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
      source,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
