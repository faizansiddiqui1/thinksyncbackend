import { getCredentials } from "./credentialResolver.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

function normalizePort(port) {
  const n = Number(port);
  return Number.isFinite(n) && n > 0 ? n : 587;
}

async function normalizeSMTP(creds = {}) {
  const defaults = await getPlatformConfigValues([
    "DEFAULT_FROM_NAME",
    "DEFAULT_FROM_EMAIL",
  ]);

  return {
    host: creds.host || "",
    port: normalizePort(creds.port),
    secure:
      typeof creds.secure === "boolean"
        ? creds.secure
        : normalizePort(creds.port) === 465,
    username: creds.username || "",
    password: creds.password || "",
    fromName: creds.fromName || defaults.DEFAULT_FROM_NAME || "Your App",
    fromEmail:
      creds.fromEmail ||
      defaults.DEFAULT_FROM_EMAIL ||
      creds.username || "",
  };
}

export const getActiveSMTP = async (tenant) => {
  const creds = await getCredentials({ tenant }, "smtp");

  const smtp = await normalizeSMTP(creds);

  if (!smtp.host || !smtp.username || !smtp.password) {
    throw new Error("SMTP credentials missing");
  }

  return smtp;
};
