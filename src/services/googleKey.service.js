import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

export const getGoogleApiKey = async () => {
  const values = await getPlatformConfigValues(["GOOGLE_API_KEY"]);
  return values.GOOGLE_API_KEY || null;
};
