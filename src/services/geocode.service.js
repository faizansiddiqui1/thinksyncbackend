// services/geocode.service.js

import axios from "axios";
import { getCredentials } from "./credentialResolver.js";

/* =========================
   CONSTANTS
========================= */

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

/* =========================
   Helpers
========================= */

const find = (components = [], type) => {
  const c = components.find((comp) => comp.types?.includes(type));
  return c ? c.long_name : undefined;
};

/* =========================
   Resolve Google (STRICT SaaS)
========================= */

async function resolveGoogleMaps(tenant) {
  const creds = await getCredentials({ tenant }, "google");

  // 🔒 IMPORTANT: No fallback for tenant
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
   Reverse Geocode
========================= */

export const reverseGeocode = async (lat, lng, { tenant } = {}) => {
  const { apiKey } = await resolveGoogleMaps(tenant);

  ensureKey(apiKey);

  try {
    const res = await axios.get(GEOCODE_URL, {
      params: {
        latlng: `${lat},${lng}`,
        key: apiKey,
      },
      timeout: 8000,
    });

    const result = res.data.results?.[0];

    if (!result) return {};

    const comps = result.address_components || [];

    const locality =
      find(comps, "sublocality_level_1") ||
      find(comps, "sublocality") ||
      find(comps, "neighborhood") ||
      "";

    // ✅ INDIA FIX
    const district =
      find(comps, "administrative_area_level_3") ||
      find(comps, "administrative_area_level_2") ||
      "";

    const city = find(comps, "locality") || find(comps, "postal_town") || "";

    const state = find(comps, "administrative_area_level_1") || "";

    const country = find(comps, "country") || "";

    const pincode = find(comps, "postal_code") || "";

    const street =
      [find(comps, "street_number"), find(comps, "route")]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      find(comps, "premise") ||
      locality ||
      result.formatted_address ||
      "";

    return {
      formatted_address: result.formatted_address || "",

      street,

      locality,

      district,

      city,

      state,

      country,

      pincode,

      lat: result.geometry?.location?.lat ?? null,

      lng: result.geometry?.location?.lng ?? null,

      address_components: comps,
    };
  } catch (err) {
    const message =
      err?.response?.data?.error_message ||
      err?.message ||
      "Reverse geocode failed";

    throw new Error(message);
  }
};

/* =========================
   Forward Geocode
========================= */

export const forwardGeocode = async (address, { tenant } = {}) => {
  const { apiKey, components } = await resolveGoogleMaps(tenant);

  ensureKey(apiKey);

  try {
    const res = await axios.get(GEOCODE_URL, {
      params: {
        address,
        key: apiKey,
        components,
      },
      timeout: 8000,
    });

    // DEBUG
    console.log("[GEOCODE RESPONSE]", JSON.stringify(res.data, null, 2));

    // =========================
    // GOOGLE STATUS CHECK
    // =========================

    if (res.data.status !== "OK") {
      throw new Error(
        res.data.error_message || `Google Geocode failed: ${res.data.status}`,
      );
    }

    const result = res.data.results?.[0];

    if (!result) {
      throw new Error("No geocoding results found");
    }

    const comps = result.address_components || [];

    return {
      formatted_address: result.formatted_address || "",

      street:
        [find(comps, "street_number"), find(comps, "route")]
          .filter(Boolean)
          .join(" ") || result.formatted_address,

      city:
        find(comps, "locality") ||
        find(comps, "sublocality") ||
        find(comps, "administrative_area_level_2") ||
        "",

      state: find(comps, "administrative_area_level_1") || "",

      country: find(comps, "country") || "",

      pincode: find(comps, "postal_code") || "",

      lat: result.geometry?.location?.lat ?? null,

      lng: result.geometry?.location?.lng ?? null,

      address_components: comps,
    };
  } catch (err) {
    console.error(
      "[FORWARD GEOCODE ERROR]",
      err?.response?.data || err.message,
    );

    throw new Error(
      err?.response?.data?.error_message ||
        err?.message ||
        "Forward geocode failed",
    );
  }
};
