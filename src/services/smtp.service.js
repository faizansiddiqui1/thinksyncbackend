import mongoose from "mongoose";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import Tenant from "../models/admin_models/tenant.model.js";
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

async function resolveSMTPTenant(tenantOrOwner) {
  if (!tenantOrOwner) return null;

  if (tenantOrOwner.adminProfileId) {
    return tenantOrOwner;
  }

  const candidateId =
    tenantOrOwner.ownerId ||
    tenantOrOwner.owner ||
    tenantOrOwner._id ||
    tenantOrOwner;

  if (!candidateId) return null;
  if (!mongoose.isValidObjectId(candidateId)) return null;

  const tenant = await Tenant.findById(candidateId)
    .select("_id adminProfileId ownerId status")
    .lean();

  if (tenant) return tenant;

  const adminProfile = await AdminProfile.findOne({
    owner: candidateId,
  })
    .select("_id whiteLabel.status")
    .lean();

  if (!adminProfile || adminProfile.whiteLabel?.status !== "approved") {
    return null;
  }

  return Tenant.findOne({
    adminProfileId: adminProfile._id,
    status: "active",
  })
    .select("_id adminProfileId ownerId status")
    .lean();
}

export const getActiveSMTP = async (tenantOrOwner = null) => {
  const tenant = await resolveSMTPTenant(tenantOrOwner);
  const creds = await getCredentials({ tenant }, "smtp");

  const smtp = await normalizeSMTP(creds);

  if (!smtp.host || !smtp.username || !smtp.password) {
    throw new Error("SMTP credentials missing");
  }

  return smtp;
};
