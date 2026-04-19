import { getCredentials } from "./credentialResolver.js";

function normalizePort(port) {
  const n = Number(port);
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function normalizeSMTP(creds = {}) {
  return {
    host: creds.host || "",
    port: normalizePort(creds.port),
    secure:
      typeof creds.secure === "boolean"
        ? creds.secure
        : normalizePort(creds.port) === 465,
    username: creds.username || "",
    password: creds.password || "",
    fromName: creds.fromName || process.env.DEFAULT_FROM_NAME || "Your App",
    fromEmail:
      creds.fromEmail ||
      process.env.DEFAULT_FROM_EMAIL ||
      creds.username || "",
  };
}

export const getActiveSMTP = async (tenant) => {
  const creds = await getCredentials({ tenant }, "smtp");

  const smtp = normalizeSMTP(creds);

  if (!smtp.host || !smtp.username || !smtp.password) {
    throw new Error("SMTP credentials missing");
  }

  return smtp;
};