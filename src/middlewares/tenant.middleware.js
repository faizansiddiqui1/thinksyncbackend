import Tenant from "../models/admin_models/tenant.model.js";

/**
 * In-memory cache (can replace with Redis later)
 */
const tenantCache = new Map();

/**
 * Cache TTL (optional - 5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Paths that DO NOT require tenant
 */
const SKIP_PATHS = ["/health"];

/**
 * Check if route should skip tenant resolution
 */
function shouldSkip(path) {
  return SKIP_PATHS.some((p) => path.startsWith(p));
}

/**
 * Get tenant from cache
 */
function getCachedTenant(host) {
  const cached = tenantCache.get(host);

  if (!cached) return null;

  // ⏱ TTL check
  if (Date.now() > cached.expiry) {
    tenantCache.delete(host);
    return null;
  }

  return cached.data;
}

/**
 * Set tenant in cache
 */
function setTenantCache(host, tenant) {
  tenantCache.set(host, {
    data: tenant,
    expiry: Date.now() + CACHE_TTL,
  });
}

/**
 * MAIN MIDDLEWARE
 */
export async function tenantMiddleware(req, res, next) {
  try {
      console.log("RAW HOST:", req.headers.host);
      
    const path = req.originalUrl;

    if (shouldSkip(path)) {
      return next();
    }

    // 🔥 FIX HERE
    const host = req.headers.host?.split(":")[0].toLowerCase();



    console.log("HOST:", host);

    if (!host) {
      return res.status(400).json({
        success: false,
        message: "Host header missing",
      });
    }

    const cachedTenant = getCachedTenant(host);

    if (cachedTenant) {
      req.tenant = cachedTenant;
      return next();
    }

    const tenant = await Tenant.findOne({ domain: host }).lean();

    console.log("TENANT FOUND:", tenant);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    setTenantCache(host, tenant);

    req.tenant = tenant;

    next();
  } catch (error) {
    next(error);
  }
}
