import { google } from "googleapis";
import GoogleToken from "../models/user_models/GoogleToken.js";
import OutlookToken from "../models/user_models/OutlookToken.js";
import User from "../models/user_models/User.js";
import { decryptToken, encryptToken } from "./calendarTokenCrypto.service.js";

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/google/callback`;

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
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
    existing.accessToken = tokens.access_token
      ? encryptToken(tokens.access_token)
      : existing.accessToken;
    existing.refreshToken = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : existing.refreshToken;
    existing.scope = tokens.scope || existing.scope;
    existing.tokenType = tokens.token_type || existing.tokenType;
    existing.expiryDate = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : existing.expiryDate;
    await existing.save();
    const hasOutlook = Boolean(await OutlookToken.exists({ userId }));
    await User.findByIdAndUpdate(userId, {
      $set: { calendarProvider: hasOutlook ? "multiple" : "google" },
    });
    return existing;
  }

  const doc = await GoogleToken.create({
    userId,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    scope: tokens.scope,
    tokenType: tokens.token_type,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
  });

  const hasOutlook = Boolean(await OutlookToken.exists({ userId }));
  await User.findByIdAndUpdate(userId, {
    $set: { calendarProvider: hasOutlook ? "multiple" : "google" },
  });

  return doc;
}

export async function getTokensForUser(userId) {
  return GoogleToken.findOne({ userId });
}

export async function disconnectGoogleCalendar(userId) {
  if (!userId) return false;

  const tokens = await GoogleToken.findOne({ userId });
  if (!tokens) return false;

  const tokenToRevoke = decryptToken(tokens.refreshToken || tokens.accessToken);
  if (tokenToRevoke) {
    try {
      const oAuth2Client = getOAuthClient();
      await oAuth2Client.revokeToken(tokenToRevoke);
    } catch (error) {
      console.warn("Google token revoke failed:", error.message);
    }
  }

  await GoogleToken.deleteOne({ _id: tokens._id });
  const hasOutlook = Boolean(await OutlookToken.exists({ userId }));
  await User.findByIdAndUpdate(userId, hasOutlook
    ? { $set: { calendarProvider: "outlook" } }
    : { $unset: { calendarProvider: "" } });
  return true;
}

export async function refreshAccessTokenIfNeeded(tokens) {
  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: decryptToken(tokens.accessToken),
    refresh_token: decryptToken(tokens.refreshToken),
    expiry_date: tokens.expiryDate
      ? new Date(tokens.expiryDate).getTime()
      : null,
  });

  try {
    const res = await oAuth2Client.getAccessToken();
    if (res && res.token) {
      return { accessToken: encryptToken(res.token) };
    }
  } catch (err) {
    // ignore
  }

  return null;
}
