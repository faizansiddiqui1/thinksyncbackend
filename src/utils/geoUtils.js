/* =========================
   Convert Degrees to Radians
========================= */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/* =========================
   Calculate Distance (Haversine)
   Returns distance in KM
========================= */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in KM

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return Math.round(distance * 10) / 10;
};

/* =========================
   Check Radius
========================= */
export const isWithinRadius = (lat1, lon1, lat2, lon2, radius) => {
  const distance = calculateDistance(lat1, lon1, lat2, lon2);
  return distance <= radius;
};
