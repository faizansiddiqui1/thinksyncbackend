// services/places.service.js
import axios from "axios";

const AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

const API_KEY = process.env.GOOGLE_API_KEY;

const ensureKey = () => {
  if (!API_KEY) throw new Error("GOOGLE_API_KEY not configured");
};

export const getPlaceAutocomplete = async (input, sessiontoken) => {
  ensureKey();

  const res = await axios.get(AUTOCOMPLETE_URL, {
    params: {
      input,
      key: API_KEY,
      sessiontoken: sessiontoken || undefined,
      components: process.env.PLACES_COMPONENTS || undefined,
      language: "en",
    },
    timeout: 5000,
  });

  return res.data;
};

export const getPlaceDetails = async (place_id, sessiontoken) => {
  ensureKey();

  const res = await axios.get(DETAILS_URL, {
    params: {
      place_id,
      key: API_KEY,
      fields: "formatted_address,geometry",
      sessiontoken: sessiontoken || undefined,
      language: "en",
    },
    timeout: 5000,
  });

  return res.data;
};
