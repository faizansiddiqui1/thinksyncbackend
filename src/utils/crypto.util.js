// src/utils/crypto.util.js

import crypto from "crypto";

const ALGO = "aes-256-gcm";

// 🔥 IMPORTANT: use hex
const rawKey = (process.env.CRYPTO_KEY || "").trim();

if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
  throw new Error("CRYPTO_KEY must be exactly 64 hex characters");
}

const KEY = Buffer.from(rawKey, "hex");

export function encrypt(text) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(text), "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(payload) {
  const data = Buffer.from(payload, "base64");

  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
