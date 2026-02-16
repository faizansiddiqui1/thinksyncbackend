import axios from "axios";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const find = (components = [], type) => {
  const c = components.find((comp) => comp.types?.includes(type));
  return c ? c.long_name : undefined;
};

export const reverseGeocode = async (lat, lng) => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const res = await axios.get(GEOCODE_URL, {
    params: { latlng: `${lat},${lng}`, key: process.env.GOOGLE_API_KEY },
    timeout: 8000,
  });

  const result = res.data.results?.[0];
  if (!result) return {};

  const comps = result.address_components || [];

  const street =
    [find(comps, "street_number"), find(comps, "route")]
      .filter(Boolean)
      .join(" ") ||
    find(comps, "premise") ||
    result.formatted_address;

  return {
    formatted_address: result.formatted_address || "",
    street,
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
  };
};

/* ================================
   NEW: Forward Geocode (manual address → coords)
================================ */
export const forwardGeocode = async (address) => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY not configured");
  }

  const res = await axios.get(GEOCODE_URL, {
    params: {
      address,
      key: process.env.GOOGLE_API_KEY,
      components: "country:IN",
    },
    timeout: 8000,
  });

  const result = res.data.results?.[0];
  if (!result) return {};

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
  };
};
