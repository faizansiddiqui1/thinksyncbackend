// controllers/property.controller.js
import { reverseGeocode } from "../../services/geocode.service.js";
import {
  getPlaceAutocomplete,
  getPlaceDetails,
} from "../../services/places.service.js";

/* =========================
   Reverse Location
========================= */
export const reverseLocationController = async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: "lat & lng required" });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ message: "lat & lng must be numbers" });
    }

    const structured = await reverseGeocode(latNum, lngNum);

    return res.json({
      ...structured, // street, city, state, pincode, country, formatted_address, address_components
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
    const input = String(req.query.input || "").trim();
    const sessiontoken = req.query.sessiontoken || undefined;

    if (!input) {
      return res.status(400).json({ message: "input required" });
    }

    const data = await getPlaceAutocomplete(input, sessiontoken);

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
// controllers/property.controller.js (replace placeDetailsController)
export const placeDetailsController = async (req, res) => {
  try {
    const place_id = String(req.query.place_id || "").trim();
    const sessiontoken = req.query.sessiontoken || undefined;

    if (!place_id) {
      return res.status(400).json({ message: "place_id required" });
    }

    const data = await getPlaceDetails(place_id, sessiontoken);
    const result = data.result || {};
    const location = result.geometry?.location || null;

    // If we have lat/lng, call reverseGeocode to get structured address components
    let structured = {};
    if (location?.lat && location?.lng) {
      structured = await reverseGeocode(location.lat, location.lng); // now returns object with street, city, state...
    }

    return res.json({
      status: data.status || "UNKNOWN",
      // include both the formatted address from Places and the structured components
      address: result.formatted_address || structured.formatted_address || "",
      street: structured.street || "",
      city: structured.city || "",
      state: structured.state || "",
      pincode: structured.pincode || "",
      country: structured.country || "",
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      // optionally return raw address_components if needed
      address_components: structured.address_components || [],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
