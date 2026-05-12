// backend/controllers/property.controller.js
import {
  textSearch,
  nearSearch,
  suggest,
} from "../../services/search.service.js";

export const searchController = async (req, res) => {
  try {
    const q = req.query.q || req.query.query || "";
    const lat = req.query.lat ? parseFloat(req.query.lat) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!q) return res.status(400).json({ message: "q (query) required" });

    const { docs, total } = await textSearch({ q, lat, lng, limit });

    // attach distance in km for convenience
    const results = docs.map((d) => {
      // safely extract distance in meters
      const m = d?.dist?.calculated ?? null;

      return {
        _id: d._id,
        name: d.name ?? null,
        address: d.address ?? null,
        lat: d.address?.location?.coordinates?.[1] ?? null,
        lng: d.address?.location?.coordinates?.[0] ?? null,
        distance_m: m,
        distance_km: m !== null ? Number((m / 1000).toFixed(3)) : null,
        score: d.score ?? null,
      };
    });

    res.json({ total, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const nearController = async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng) : null;
    const radius = req.query.radius ? parseInt(req.query.radius, 10) : 5000;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    if (!lat || !lng)
      return res.status(400).json({ message: "lat & lng required" });

    const { docs, total } = await nearSearch({ lat, lng, radius, limit });

    const results = docs.map((d) => {
      const meters = d.dist?.calculated ?? null;
      return {
        _id: d._id,
        name: d.name,
        address: d.address,
        lat: d.address?.location?.coordinates?.[1] ?? null,
        lng: d.address?.location?.coordinates?.[0] ?? null,
        distance_m: meters,
        distance_km: meters != null ? +(meters / 1000).toFixed(3) : null,
      };
    });

    res.json({ total, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const suggestController = async (req, res) => {
  try {
    const input = req.query.input || "";
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 8;
    if (!input || input.trim().length < 1) return res.json({ predictions: [] });

    const items = await suggest({ input, limit });
    res.json({ predictions: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
