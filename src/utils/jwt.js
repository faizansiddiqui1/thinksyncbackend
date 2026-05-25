import jwt from "jsonwebtoken";
import { getPlatformConfigValues } from "../services/platformConfigResolver.service.js";

async function getJwtRuntimeConfig() {
  const values = await getPlatformConfigValues([
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRY",
    "JWT_REFRESH_EXPIRY",
  ]);

  return {
    accessSecret: values.JWT_ACCESS_SECRET,
    refreshSecret: values.JWT_REFRESH_SECRET,
    accessExpiry: values.JWT_ACCESS_EXPIRY || "60m",
    refreshExpiry: values.JWT_REFRESH_EXPIRY || "7d",
  };
}

export const accessToken = async (payload) => {
  const config = await getJwtRuntimeConfig();
  return jwt.sign(payload, config.accessSecret, {
    expiresIn: config.accessExpiry,
  });
};

export const refreshToken = async (payload) => {
  const config = await getJwtRuntimeConfig();
  return jwt.sign(payload, config.refreshSecret, {
    expiresIn: config.refreshExpiry,
  });
};

export const verifyAccessToken = async (token) => {
  try {
    const config = await getJwtRuntimeConfig();
    return jwt.verify(token, config.accessSecret);
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
};

export const verifyRefreshToken = async (token) => {
  try {
    const config = await getJwtRuntimeConfig();
    return jwt.verify(token, config.refreshSecret);
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
};

export const generateTokenPair = async (userId, role) => {
  const payload = { userId, role };
  return {
    accessToken: await accessToken(payload),
    refreshToken: await refreshToken(payload),
  };
};
