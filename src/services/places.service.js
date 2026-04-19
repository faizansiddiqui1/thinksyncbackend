// services/places.service.js

import axios from "axios";
import { getCredentials } from "./credentialResolver.js";

/* =========================
   CONSTANTS
========================= */

const AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";

const DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

/* =========================
   Resolve Google API Key (STRICT SaaS)
========================= */

async function resolveGoogleMaps(tenant) {
  const creds = await getCredentials({ tenant }, "google"); // ✅ FIXED

  // 🔒 NO FALLBACK ALLOWED
  if (!creds?.apiKey) {
    throw new Error("Google API key missing for tenant");
  }

  return {
    apiKey: creds.apiKey,
    components: creds.placesComponents || "country:IN",
  };
}

function ensureKey(apiKey) {
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY not configured");
  }
}

/* =========================
   AUTOCOMPLETE
========================= */

export const getPlaceAutocomplete = async (
  input,
  sessiontoken,
  { tenant } = {}
) => {
  const { apiKey, components } = await resolveGoogleMaps(tenant);

  ensureKey(apiKey);

  try {
    const res = await axios.get(AUTOCOMPLETE_URL, {
      params: {
        input,
        key: apiKey,
        sessiontoken: sessiontoken || undefined,
        components,
        language: "en",
      },
      timeout: 5000,
    });

    return res.data;
  } catch (err) {
    const message =
      err?.response?.data?.error_message ||
      err?.message ||
      "Autocomplete failed";

    throw new Error(message);
  }
};

/* =========================
   PLACE DETAILS
========================= */

export const getPlaceDetails = async (
  place_id,
  sessiontoken,
  { tenant } = {}
) => {
  const { apiKey } = await resolveGoogleMaps(tenant);

  ensureKey(apiKey);

  try {
    const res = await axios.get(DETAILS_URL, {
      params: {
        place_id,
        key: apiKey,
        fields: "formatted_address,geometry",
        sessiontoken: sessiontoken || undefined,
        language: "en",
      },
      timeout: 5000,
    });

    return res.data;
  } catch (err) {
    const message =
      err?.response?.data?.error_message ||
      err?.message ||
      "Place details failed";

    throw new Error(message);
  }
};