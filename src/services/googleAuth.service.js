import { google } from "googleapis";
import GoogleToken from "../models/user_models/GoogleToken.js";

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "http://localhost:5000/api/auth/google/callback",
  );
}



export function generateAuthUrl({ userId }) {
  const oAuth2Client = getOAuthClient();

  console.log("REDIRECT URI:");
  console.log(oAuth2Client.redirectUri);

  const scopes = ["https://www.googleapis.com/auth/calendar"];

  const state = Buffer.from(String(userId || "")).toString("base64");

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });

  console.log(url);

  return url;
}

export async function exchangeCodeForTokens(code, state) {
  const oAuth2Client = getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);

  // tokens contains access_token, refresh_token, expiry_date etc.
  return tokens;
}

export async function saveTokensForUser(userId, tokens) {
  if (!userId) return null;

  const existing = await GoogleToken.findOne({ userId });
  if (existing) {
    existing.accessToken = tokens.access_token || existing.accessToken;
    existing.refreshToken = tokens.refresh_token || existing.refreshToken;
    existing.scope = tokens.scope || existing.scope;
    existing.tokenType = tokens.token_type || existing.tokenType;
    existing.expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : existing.expiryDate;
    await existing.save();
    return existing;
  }

  const doc = await GoogleToken.create({
    userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
    tokenType: tokens.token_type,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
  });

  return doc;
}

export async function getTokensForUser(userId) {
  return GoogleToken.findOne({ userId });
}

export async function refreshAccessTokenIfNeeded(tokens) {
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate
      ? new Date(tokens.expiryDate).getTime()
      : null,
  });

  try {
    const res = await oAuth2Client.getAccessToken();
    if (res && res.token) {
      return { accessToken: res.token };
    }
  } catch (err) {
    // ignore
  }

  return null;
}
