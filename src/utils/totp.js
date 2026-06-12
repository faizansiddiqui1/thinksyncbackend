import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeSecret(secret = "") {
  return String(secret || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");
}

export function base32Encode(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input = "") {
  const secret = normalizeSecret(input);
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of secret) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpSecret(size = 20) {
  return base32Encode(crypto.randomBytes(Math.max(10, Number(size || 20))));
}

function hotp(secret, counter, digits = 6, algorithm = "sha1") {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto
    .createHmac(algorithm, key)
    .update(counterBuffer)
    .digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function generateTotpCode(
  secret,
  { digits = 6, period = 30, algorithm = "sha1", time = Date.now() } = {},
) {
  const counter = Math.floor(Number(time) / 1000 / period);
  return hotp(secret, counter, digits, algorithm);
}

export function verifyTotpCode(
  secret,
  code,
  { digits = 6, period = 30, algorithm = "sha1", time = Date.now(), window = 1 } = {},
) {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return false;

  const currentCounter = Math.floor(Number(time) / 1000 / period);
  for (let offset = -window; offset <= window; offset += 1) {
    if (
      hotp(secret, currentCounter + offset, digits, algorithm) === normalizedCode
    ) {
      return true;
    }
  }

  return false;
}

export function buildOtpAuthUrl({
  secret,
  accountName,
  issuer = "ThinkSync",
  digits = 6,
  period = 30,
}) {
  const label = `${issuer}:${accountName || "account"}`;
  const params = new URLSearchParams({
    secret: normalizeSecret(secret),
    issuer,
    digits: String(digits),
    period: String(period),
    algorithm: "SHA1",
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
