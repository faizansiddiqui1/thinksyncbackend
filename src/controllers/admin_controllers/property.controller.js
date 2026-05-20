import { reverseGeocode } from "../../services/geocode.service.js";
import {
  getPlaceAutocomplete,
  getPlaceDetails,
} from "../../services/places.service.js";

/* =========================
   Helpers
========================= */

function getContext(req) {
  return req.context || {};
}

function getTenant(req) {
  return getContext(req).tenant || null;
}

/* =========================
   Reverse Location
========================= */

export const reverseLocationController = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const tenant = getTenant(req);

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat & lng required" });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ message: "lat & lng must be numbers" });
    }

    // ✅ tenant pass kiya
    const structured = await reverseGeocode(latNum, lngNum, { tenant });

    return res.json({
      ...structured,
      lat: latNum,
      lng: lngNum,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* =========================
   Autocomplete
========================= */

export const autocompleteController = async (req, res) => {
  try {
    const tenant = getTenant(req);

    const input = String(req.query.input || "").trim();
    const sessiontoken = req.query.sessiontoken || undefined;

    if (!input) {
      return res.status(400).json({ message: "input required" });
    }

    // ✅ tenant pass kiya
    const data = await getPlaceAutocomplete(input, sessiontoken, { tenant });

    const predictions = (data.predictions || []).map((p) => ({
      description: p.description,
      place_id: p.place_id,
      structured_formatting: p.structured_formatting,
    }));

    return res.json({
      status: data.status || "UNKNOWN",
      predictions,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/* =========================
   Place Details
========================= */

export const placeDetailsController = async (req, res) => {
  try {
    const tenant = getTenant(req);

    const place_id = String(req.query.place_id || "").trim();
    const sessiontoken = req.query.sessiontoken || undefined;

    if (!place_id) {
      return res.status(400).json({ message: "place_id required" });
    }

    // ✅ tenant pass kiya
    const data = await getPlaceDetails(place_id, sessiontoken, { tenant });

    const result = data.result || {};
    const location = result.geometry?.location || null;

    let structured = {};

    // ✅ reverseGeocode mein bhi tenant pass
    if (location?.lat && location?.lng) {
      structured = await reverseGeocode(location.lat, location.lng, {
        tenant,
      });
    }

    return res.json({
      status: data.status || "UNKNOWN",

      address: result.formatted_address || structured.formatted_address || "",

      street: structured.street || "",

      locality: structured.locality || "",

      district: structured.district || "",

      city: structured.city || "",

      state: structured.state || "",

      pincode: structured.pincode || "",

      country: structured.country || "",

      lat: location?.lat ?? null,

      lng: location?.lng ?? null,

      address_components: structured.address_components || [],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
