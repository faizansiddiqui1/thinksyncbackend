import Tenant from "../models/admin_models/tenant.model.js";

/* =========================
   CACHE (in-memory)
========================= */

const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/* =========================
   CONFIG
========================= */

const SKIP_PATHS = ["/health"];

/* =========================
   HELPERS
========================= */

function shouldSkip(path) {
  return SKIP_PATHS.some((p) => path.startsWith(p));
}

// ✅ normalize domain (remove port + www)
function normalizeDomain(host) {
  if (!host) return null;

  let domain = host.split(":")[0].toLowerCase();

  if (domain.startsWith("www.")) {
    domain = domain.replace("www.", "");
  }

  return domain;
}

// ✅ extract subdomain (tenant1.app.com → tenant1)
function extractSubdomain(domain) {
  const parts = domain.split(".");

  if (parts.length > 2) {
    return parts[0];
  }

  return null;
}

/* =========================
   CACHE HELPERS
========================= */

function getCachedTenant(key) {
  const cached = tenantCache.get(key);

  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    tenantCache.delete(key);
    return null;
  }

  return cached.data;
}

function setTenantCache(key, tenant) {
  tenantCache.set(key, {
    data: tenant,
    expiry: Date.now() + CACHE_TTL,
  });
}

/* =========================
   CONTEXT
========================= */

function buildContext(req) {
  return {
    tenant: req.tenant || null,
    user: req.user || null,
    requestId: req.headers["x-request-id"] || null,
    ip: req.ip,
  };
}

/* =========================
   MAIN MIDDLEWARE
========================= */

export async function tenantMiddleware(req, res, next) {
  try {
    const path = req.originalUrl;

    // ✅ skip routes
    if (shouldSkip(path)) {
      req.context = buildContext(req);
      return next();
    }

    const rawHost = req.headers.host;

    if (!rawHost) {
      return res.status(400).json({
        success: false,
        message: "Host header missing",
      });
    }

    const domain = normalizeDomain(rawHost);

    if (!domain) {
      return res.status(400).json({
        success: false,
        message: "Invalid host",
      });
    }

    let tenant = getCachedTenant(domain);

    if (!tenant) {
      // 🔥 1. try full domain (custom domain)
      tenant = await Tenant.findOne({ domain }).lean();

      // 🔥 2. try subdomain (tenant1.app.com)
      if (!tenant) {
        const subdomain = extractSubdomain(domain);

        if (subdomain) {
          tenant = await Tenant.findOne({ domain: subdomain }).lean();
        }
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: "Tenant not found",
        });
      }

      // ❌ suspended tenant block
      if (tenant.status === "suspended") {
        return res.status(403).json({
          success: false,
          message: "Tenant suspended",
        });
      }

      setTenantCache(domain, tenant);
    }

    // ✅ attach tenant
    req.tenant = tenant;

    // ✅ attach context
    req.context = buildContext(req);

    next();
  } catch (error) {
    next(error);
  }
}