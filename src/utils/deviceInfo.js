function includes(text = "", patterns = []) {
  const normalized = String(text || "").toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern));
}

export function detectBrowser(userAgent = "") {
  const normalized = String(userAgent || "").toLowerCase();

  if (normalized.includes("edg/")) return "Microsoft Edge";
  if (normalized.includes("opr/") || normalized.includes("opera")) return "Opera";
  if (normalized.includes("chrome/")) return "Chrome";
  if (normalized.includes("safari/") && !normalized.includes("chrome/")) {
    return "Safari";
  }
  if (normalized.includes("firefox/")) return "Firefox";
  if (normalized.includes("msie") || normalized.includes("trident/")) {
    return "Internet Explorer";
  }
  return "Unknown browser";
}

export function detectOperatingSystem(userAgent = "") {
  const match = includes(userAgent, [
    "windows nt",
    "android",
    "iphone",
    "ipad",
    "mac os x",
    "linux",
    "cros",
  ]);

  if (!match) return "Unknown OS";
  if (match === "windows nt") return "Windows";
  if (match === "android") return "Android";
  if (match === "iphone") return "iPhone";
  if (match === "ipad") return "iPad";
  if (match === "mac os x") return "macOS";
  if (match === "linux") return "Linux";
  if (match === "cros") return "Chrome OS";
  return "Unknown OS";
}

export function buildDeviceLabel(userAgent = "") {
  const browser = detectBrowser(userAgent);
  const os = detectOperatingSystem(userAgent);
  return browser === "Unknown browser" && os === "Unknown OS"
    ? "Unknown device"
    : `${browser} on ${os}`;
}
