import axios from "axios";
import crypto from "crypto";

function md5(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function parseDigestHeader(header = "") {
  const normalized = String(header || "").replace(/^Digest\s+/i, "");
  const pairs = normalized.match(/([a-zA-Z0-9_-]+)=("[^"]*"|[^,]+)/g) || [];

  return pairs.reduce((accumulator, pair) => {
    const [rawKey, rawValue] = pair.split("=");
    accumulator[rawKey.trim()] = String(rawValue || "")
      .trim()
      .replace(/^"|"$/g, "");
    return accumulator;
  }, {});
}

function buildRequestUri(url) {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

async function performPlainRequest({
  method = "GET",
  url,
  headers = {},
  data = undefined,
  timeout = 10000,
  auth = undefined,
}) {
  return axios({
    method,
    url,
    headers,
    data,
    timeout,
    auth,
    validateStatus: () => true,
  });
}

async function performDigestRequest({
  method = "GET",
  url,
  headers = {},
  data = undefined,
  timeout = 10000,
  username,
  password,
}) {
  const firstResponse = await performPlainRequest({
    method,
    url,
    headers,
    data,
    timeout,
  });

  const challengeHeader =
    firstResponse.headers?.["www-authenticate"] ||
    firstResponse.headers?.["WWW-Authenticate"];

  if (
    firstResponse.status !== 401 ||
    !challengeHeader ||
    !String(challengeHeader).toLowerCase().includes("digest")
  ) {
    return firstResponse;
  }

  const digest = parseDigestHeader(challengeHeader);
  const uri = buildRequestUri(url);
  const qopValue = String(digest.qop || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
  const qop = qopValue || "auth";
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const ha1 = md5(`${username}:${digest.realm}:${password}`);
  const ha2 = md5(`${String(method).toUpperCase()}:${uri}`);
  const responseHash = md5(
    `${ha1}:${digest.nonce}:${nc}:${cnonce}:${qop}:${ha2}`,
  );

  const authorizationParts = [
    `Digest username="${username}"`,
    `realm="${digest.realm}"`,
    `nonce="${digest.nonce}"`,
    `uri="${uri}"`,
    `response="${responseHash}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
  ];

  if (digest.opaque) {
    authorizationParts.push(`opaque="${digest.opaque}"`);
  }

  if (digest.algorithm) {
    authorizationParts.push(`algorithm=${digest.algorithm}`);
  }

  return performPlainRequest({
    method,
    url,
    headers: {
      ...headers,
      Authorization: authorizationParts.join(", "),
    },
    data,
    timeout,
  });
}

export function buildDeviceBaseUrl(payload = {}) {
  if (payload?.apiEndpoint) {
    return String(payload.apiEndpoint).trim().replace(/\/+$/, "");
  }

  const protocol = payload?.protocol || "http";
  const ipAddress = String(payload?.deviceIp || "").trim();
  if (!ipAddress) return "";

  const port = payload?.port ? `:${payload.port}` : "";
  return `${protocol}://${ipAddress}${port}`;
}

export async function sendProviderRequest({
  payload = {},
  method = "GET",
  path = "/",
  headers = {},
  data = undefined,
  timeout = 10000,
}) {
  const baseUrl = buildDeviceBaseUrl(payload);
  if (!baseUrl) {
    throw new Error("Device base URL is missing");
  }

  const url = path.startsWith("http")
    ? path
    : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const authMethod = String(payload?.authMethod || "").trim();
  const credentials = payload?.credentials || {};

  if (authMethod === "hikvision_isapi_digest") {
    return performDigestRequest({
      method,
      url,
      headers,
      data,
      timeout,
      username: credentials.username,
      password: credentials.password,
    });
  }

  if (authMethod === "zkteco_basic_auth") {
    return performPlainRequest({
      method,
      url,
      headers,
      data,
      timeout,
      auth: {
        username: credentials.username,
        password: credentials.password,
      },
    });
  }

  if (authMethod === "zkteco_access_token") {
    return performPlainRequest({
      method,
      url,
      headers: {
        ...headers,
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      data,
      timeout,
    });
  }

  if (authMethod === "zkteco_api_key") {
    return performPlainRequest({
      method,
      url,
      headers: {
        ...headers,
        "X-API-Key": credentials.apiKey || "",
        "X-API-Secret": credentials.secretKey || "",
      },
      data,
      timeout,
    });
  }

  return performPlainRequest({
    method,
    url,
    headers,
    data,
    timeout,
  });
}
