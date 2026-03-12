// helpers/cashfree.js
import axios from "axios";
import fs from "fs";
import crypto from "crypto";
import FormDataPkg from "form-data";

// Ensure we ALWAYS use the Node 'form-data' implementation (avoid global FormData collision)
const FormDataNode =
  FormDataPkg && FormDataPkg.default ? FormDataPkg.default : FormDataPkg;

const env = process.env.CASHFREE_ENV;

let PAYOUT_BASE = "https://api.cashfree.com";
let VERIF_BASE = "https://api.cashfree.com/verification";

if (env === "sandbox") {
  PAYOUT_BASE = "https://sandbox.cashfree.com";
  VERIF_BASE = "https://sandbox.cashfree.com/verification";
}

function makeSignature() {
  if (env !== "production" || !process.env.CASHFREE_PUBLIC_KEY_PATH)
    return null;
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${process.env.CASHFREE_CLIENT_ID}.${ts}`;
  const pubKey = fs.readFileSync(process.env.CASHFREE_PUBLIC_KEY_PATH, "utf8");
  const encrypted = crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(payload, "utf8"),
  );
  return encrypted.toString("base64");
}

function baseHeaders() {
  // important: do NOT set Content-Type here
  const h = {
    "x-client-id": process.env.CASHFREE_CLIENT_ID,
    "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
    "x-api-version": "2024-12-01",
  };
  const sig = makeSignature();
  if (sig) h["X-Cf-Signature"] = sig;
  return h;
}

export async function cfPost(path, body) {
  const url = `${VERIF_BASE}${path}`;
  const headers = {
    ...baseHeaders(),
    "Content-Type": "application/json",
  };
  const res = await axios.post(url, body, { headers, timeout: 20000 });
  return res.data;
}

export async function cfMultipartPost(path, formOrObject) {
  const url = `${VERIF_BASE}${path}`;

  let form;
  if (formOrObject && typeof formOrObject.getHeaders === "function") {
    // already a node-form-data instance
    form = formOrObject;
  } else {
    // convert plain object -> FormDataNode and ensure Buffers/Streams are appended correctly
    form = new FormDataNode();
    for (const key of Object.keys(formOrObject || {})) {
      const val = formOrObject[key];

      // if value is Buffer or Stream, append appropriately
      if (Buffer.isBuffer(val) || val?.pipe) {
        // if val has filename metadata (object with buffer + filename) handle that
        if (
          val &&
          typeof val === "object" &&
          val.buffer &&
          (val.filename || val.contentType)
        ) {
          form.append(key, Buffer.from(val.buffer), {
            filename: val.filename || "file",
            contentType: val.contentType || undefined,
          });
        } else {
          form.append(
            key,
            val,
            typeof val === "object" && val.filename
              ? { filename: val.filename }
              : undefined,
          );
        }
      } else {
        // string/number/boolean -> convert to string
        form.append(key, val === undefined || val === null ? "" : String(val));
      }
    }
  }

  const headers = {
    ...baseHeaders(),
    ...form.getHeaders(), // contains Content-Type: multipart/form-data; boundary=...
  };

  try {
    const res = await axios.post(url, form, {
      headers,
      timeout: 20000,
      maxBodyLength: Infinity,
    });
    return res.data;
  } catch (err) {
    // surface useful error for debugging
    const remote = err.response?.data || err.message;
    // rethrow with the remote data attached so caller can inspect
    const e = new Error("Cashfree multipart error: " + JSON.stringify(remote));
    e.remote = remote;
    throw e;
  }
}

export async function cfGetFull(url, params = {}) {
  const res = await axios.get(url, {
    headers: baseHeaders(),
    params,
    timeout: 20000,
  });

  console.log("ENV:", process.env.CASHFREE_ENV);
  console.log("URL:", url);
  console.log("CLIENT:", process.env.CASHFREE_CLIENT_ID);
  return res.data;
}

export function payoutBankSyncUrl() {
  return `${VERIF_BASE}/bank-account/sync`;
}
