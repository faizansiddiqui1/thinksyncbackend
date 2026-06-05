import { decrypt, encrypt } from "../utils/crypto.util.js";

const ENCRYPTED_PREFIX = "enc:";

export function encryptToken(value) {
  if (!value) return value;
  const text = String(value);
  if (text.startsWith(ENCRYPTED_PREFIX)) return text;
  return `${ENCRYPTED_PREFIX}${encrypt(text)}`;
}

export function decryptToken(value) {
  if (!value) return value;
  const text = String(value);
  if (!text.startsWith(ENCRYPTED_PREFIX)) return text;
  return decrypt(text.slice(ENCRYPTED_PREFIX.length));
}
