import AdminProfile from "../models/admin_models/AdminProfile.js";

export async function getDefaultKycConfig() {
  const global = await AdminProfile.findOne({
    "company.name": "GLOBAL_DEFAULT"
  }).lean();

  if (global?.kyc?.config) {
    return global.kyc.config;
  }

  // fallback agar record missing ho
  return {
    requireFaceMatch: true,
    requirePan: true,
    requireCin: true,
    requireVideoKyc: true,
    requireBankCheack: true,
    requireGstin: true
  };
}