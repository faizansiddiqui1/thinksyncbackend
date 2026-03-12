import * as service from "../../services/offer.service.js";

export const createOffer = async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const offer = await service.createOffer(spaceId, req.body, req.user?.id);
    return res.status(201).json({ message: "Offer created", data: offer });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const listOffers = async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const offers = await service.listOffers(spaceId);
    if (!offers || offers.length === 0) {
      return res.status(404).json({ message: "No active offers found for this space" });
    }
    return res.status(200).json({ message: "Offers fetched", data: offers });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};


export const listAllOffers = async (req, res) => {
  try {
    const offers = await service.listAllOffers();

    if (!offers || offers.length === 0) {
      return res.status(404).json({ message: "No active offers found" });
    }

    return res.status(200).json({
      message: "All offers fetched successfully",
      data: offers,
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const updateOffer = async (req, res) => {
  try {
    const { spaceId, offerId } = req.params;
    const offer = await service.updateOffer(spaceId, offerId, req.body, req.user?.id);
    if (!offer) return res.status(404).json({ message: "Offer not found" });
    return res.status(200).json({ message: "Offer updated", data: offer });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

export const deleteOffer = async (req, res) => {
  try {
    const { spaceId, offerId } = req.params;
    const ok = await service.deleteOffer(spaceId, offerId, req.user?.id);
    if (!ok) return res.status(404).json({ message: "Offer not found" });
    return res.status(200).json({ message: "Offer deleted" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

/**
 * Validate/Apply an offer code for a booking request body:
 * { code, userId, planType, bookingAmount }
 * returns computed discount and finalAmount plus offer info
 */
export const validateOffer = async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const { code, userId, planType, bookingAmount } = req.body;

    const result = await service.validateAndApplyOffer({
      spaceId,
      code,
      userId,
      planType,
      bookingAmount,
    });

    return res.status(200).json({ message: "Offer valid", data: result });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
