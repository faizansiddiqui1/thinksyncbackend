import { getPlatformConfigValue } from "../services/platformConfigResolver.service.js";

function getClientKey(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "anonymous"
  );
}

function getIdentifierKey(req) {
  const identifier =
    req.body?.identifier ||
    req.body?.email ||
    req.body?.phoneNumber ||
    req.body?.phone ||
    "";

  return `${getClientKey(req)}:${String(identifier).trim().toLowerCase() || "anonymous"}`;
}

function sendRateLimitResponse(res, message, retryAfter = 0) {
  if (typeof message === "string") {
    return res.status(429).json({
      message,
      retryAfterSeconds: retryAfter,
    });
  }

  return res.status(429).json(
    {
      ...(message || {
        success: false,
        error: "Too many requests, please try again later",
      }),
      retryAfterSeconds: retryAfter,
    },
  );
}

function createDynamicRateLimiter({
  windowKey,
  maxKey,
  defaultWindowMs,
  defaultMax,
  message,
  keyGenerator = getClientKey,
}) {
  const store = new Map();

  return async (req, res, next) => {
    try {
      const tasks = [
        windowKey
          ? getPlatformConfigValue(windowKey, { defaultValue: defaultWindowMs })
          : Promise.resolve(defaultWindowMs),
        maxKey
          ? getPlatformConfigValue(maxKey, { defaultValue: defaultMax })
          : Promise.resolve(defaultMax),
      ];
      const [windowMsValue, maxValue] = await Promise.all(tasks);

      const windowMs = Number(windowMsValue || defaultWindowMs);
      const max = Number(maxValue || defaultMax);
      const now = Date.now();
      const key = keyGenerator(req);
      const current = store.get(key);

      let record = current;
      if (!record || record.resetAt <= now) {
        record = {
          count: 0,
          resetAt: now + windowMs,
        };
      }

      record.count += 1;
      store.set(key, record);

      if (record.count === 1 || record.count % 50 === 0) {
        for (const [entryKey, entryValue] of store.entries()) {
          if (entryValue.resetAt <= now) {
            store.delete(entryKey);
          }
        }
      }

      const retryAfter = Math.max(
        Math.ceil((record.resetAt - now) / 1000),
        0,
      );

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader(
        "X-RateLimit-Remaining",
        String(Math.max(max - record.count, 0)),
      );
      res.setHeader(
        "X-RateLimit-Reset",
        String(Math.ceil(record.resetAt / 1000)),
      );

      if (record.count > max) {
        res.setHeader("Retry-After", String(retryAfter));
        return sendRateLimitResponse(res, message, retryAfter);
      }

      return next();
    } catch (error) {
      console.error("Dynamic rate limiter error:", error?.message || error);
      return next();
    }
  };
}

export const generalRateLimiter = createDynamicRateLimiter({
  windowKey: "RATE_LIMIT_WINDOW_MS",
  maxKey: "RATE_LIMIT_MAX_REQUESTS",
  defaultWindowMs: 15 * 60 * 1000,
  defaultMax: 100,
  message: "Too many requests, please try again later.",
});

export const otpRateLimiter = createDynamicRateLimiter({
  windowKey: "RATE_LIMIT_WINDOW_MS",
  maxKey: "OTP_RATE_LIMIT_MAX",
  defaultWindowMs: 15 * 60 * 1000,
  defaultMax: 5,
  message: "Too many OTP requests, please try again later.",
});

export const otpSendRateLimiter = createDynamicRateLimiter({
  windowKey: null,
  maxKey: null,
  defaultWindowMs: 45 * 1000,
  defaultMax: 3,
  message: "Too many OTP requests, please wait before requesting a new code.",
  keyGenerator: getIdentifierKey,
});

export const generalLimiter = createDynamicRateLimiter({
  windowKey: "RATE_LIMIT_WINDOW_MS",
  maxKey: "RATE_LIMIT_MAX_REQUESTS",
  defaultWindowMs: 15 * 60 * 1000,
  defaultMax: 100,
  message: {
    success: false,
    error: "Too many requests, please try again later",
  },
});

export const searchLimiter = createDynamicRateLimiter({
  windowKey: null,
  maxKey: null,
  defaultWindowMs: 1 * 60 * 1000,
  defaultMax: 30,
  message: {
    success: false,
    error: "Too many search requests, please try again later",
  },
});

export const bookingLimiter = createDynamicRateLimiter({
  windowKey: null,
  maxKey: null,
  defaultWindowMs: 60 * 60 * 1000,
  defaultMax: 10,
  message: {
    success: false,
    error: "Too many booking attempts, please try again later",
  },
});
