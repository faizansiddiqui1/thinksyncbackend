import { getGlobalKycConfig } from "./globalKycConfig.service.js";

export async function getDefaultKycConfig() {
  return getGlobalKycConfig();
}
