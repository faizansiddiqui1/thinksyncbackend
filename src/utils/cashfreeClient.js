// utils/cashfreeClient.js

import axios from "axios";
import fs from "fs";
import crypto from "crypto";
import FormDataPkg from "form-data";
import { getCredentials } from "../services/credentialResolver.js";

const FormDataNode =
  FormDataPkg && FormDataPkg.default ? FormDataPkg.default : FormDataPkg;

/* =========================
   Helpers
========================= */

function normalizeEnv(env) {
  return (env || "").toLowerCase().trim();
}

function getVerifBase(env) {
  const normalized = normalizeEnv(env);

  if (normalized === "sandbox" || normalized === "test") {
    return "https://sandbox.cashfree.com/verification";
  }

  return "https://api.cashfree.com/verification";
}

/* =========================
   Resolve Cashfree (STRICT SaaS)
========================= */

async function resolveCashfree(tenant) {
  const creds = await getCredentials({ tenant }, "cashfree");

  // 🔒 NO FALLBACK HERE
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new Error("Cashfree credentials missing for tenant");
  }

  return {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    env: creds.env || "production",
    publicKeyPath: creds.publicKeyPath,
  };
}

/* =========================
   Signature (Prod only)
========================= */

function makeSignature(creds) {
  const env = normalizeEnv(creds.env);

  if (
    env !== "production" ||
    !creds.publicKeyPath ||
    !fs.existsSync(creds.publicKeyPath)
  ) {
    return null;
  }

  const ts = Math.floor(Date.now() / 1000);
  const payload = `${creds.clientId}.${ts}`;
  const pubKey = fs.readFileSync(creds.publicKeyPath, "utf8");

  const encrypted = crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(payload, "utf8")
  );

  return encrypted.toString("base64");
}

/* =========================
   Base Headers
========================= */

async function baseHeaders(tenant) {
  const creds = await resolveCashfree(tenant);

  const headers = {
    "x-client-id": creds.clientId,
    "x-client-secret": creds.clientSecret,
    "x-api-version": "2024-12-01",
  };

  const sig = makeSignature(creds);
  if (sig) headers["X-Cf-Signature"] = sig;

  return { headers, creds };
}

/* =========================
   POST JSON
========================= */

export async function cfPost(tenant, path, body) {
  const { headers, creds } = await baseHeaders(tenant);
  const url = `${getVerifBase(creds.env)}${path}`;

  try {
    const res = await axios.post(url, body, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    return res.data;
  } catch (err) {
    console.log("CF ERROR FULL:", err?.response?.data || err.message);

    const e = new Error(
      err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Cashfree request failed"
    );

    e.response = err.response;
    throw e;
  }
}

/* =========================
   POST MULTIPART
========================= */

export async function cfMultipartPost(tenant, path, formOrObject) {
  const { headers, creds } = await baseHeaders(tenant);
  const url = `${getVerifBase(creds.env)}${path}`;

  let form;

  if (formOrObject && typeof formOrObject.getHeaders === "function") {
    form = formOrObject;
  } else {
    form = new FormDataNode();

    for (const key of Object.keys(formOrObject || {})) {
      const val = formOrObject[key];

      if (Buffer.isBuffer(val) || val?.pipe) {
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
              : undefined
          );
        }
      } else {
        form.append(key, val === undefined || val === null ? "" : String(val));
      }
    }
  }

  try {
    const res = await axios.post(url, form, {
      headers: {
        ...headers,
        ...form.getHeaders(),
      },
      timeout: 20000,
      maxBodyLength: Infinity,
    });

    return res.data;
  } catch (err) {
    const remote = err?.response?.data || err?.message;

    const e = new Error(
      "Cashfree multipart error: " +
        (typeof remote === "string" ? remote : JSON.stringify(remote))
    );

    e.remote = remote;
    throw e;
  }
}

/* =========================
   GET
========================= */

export async function cfGetFull(tenant, url, params = {}) {
  const { headers } = await baseHeaders(tenant);

  const res = await axios.get(url, {
    headers,
    params,
    timeout: 20000,
  });

  return res.data;
}

/* =========================
   Helper URL
========================= */

export async function payoutBankSyncUrl(tenant) {
  const { creds } = await baseHeaders(tenant);
  return `${getVerifBase(creds.env)}/bank-account/sync`;
}