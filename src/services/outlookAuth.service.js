import axios from "axios";
import crypto from "crypto";
import GoogleToken from "../models/user_models/GoogleToken.js";
import OutlookToken from "../models/user_models/OutlookToken.js";
import User from "../models/user_models/User.js";
import { encryptToken, decryptToken } from "./calendarTokenCrypto.service.js";
import { getMe } from "./outlookGraph.service.js";

const MICROSOFT_AUTHORITY =
  process.env.MICROSOFT_AUTHORITY || "https://login.microsoftonline.com/common";
const REDIRECT_URI =
  process.env.MICROSOFT_REDIRECT_URI ||
  `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/outlook/callback`;
const SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite"];

function requireMicrosoftConfig() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth is not configured");
  }
}

function getStateSecret() {
  return process.env.MICROSOFT_STATE_SECRET || process.env.JWT_ACCESS_SECRET || process.env.CRYPTO_KEY;
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getStateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verifyState(state) {
  if (!state || !state.includes(".")) return null;
  const [body, signature] = String(state).split(".");
  const expected = crypto
    .createHmac("sha256", getStateSecret())
    .update(body)
    .digest("base64url");

  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  ) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!parsed?.userId || !parsed?.nonce || !parsed?.issuedAt) return null;
  if (Date.now() - Number(parsed.issuedAt) > 10 * 60 * 1000) return null;
  return parsed;
}

export function generateAuthUrl({ userId }) {
  requireMicrosoftConfig();
  const url = new URL(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set(
    "state",
    signState({
      userId: String(userId || ""),
      nonce: crypto.randomBytes(16).toString("hex"),
      issuedAt: Date.now(),
    }),
  );
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCodeForTokens(code) {
  requireMicrosoftConfig();
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
  });

  const { data } = await axios.post(
    `${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`,
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return data;
}

export async function refreshOutlookTokens(tokenDoc) {
  requireMicrosoftConfig();
  const refreshToken = decryptToken(tokenDoc.refreshToken);
  if (!refreshToken) throw new Error("Missing Outlook refresh token");

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(" "),
  });

  const { data } = await axios.post(
    `${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`,
    params,
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );

  tokenDoc.accessToken = encryptToken(data.access_token || decryptToken(tokenDoc.accessToken));
  if (data.refresh_token) {
    tokenDoc.refreshToken = encryptToken(data.refresh_token);
  }
  tokenDoc.scope = data.scope || tokenDoc.scope;
  tokenDoc.tokenType = data.token_type || tokenDoc.tokenType;
  tokenDoc.expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000)
    : tokenDoc.expiresAt;
  tokenDoc.lastTokenRefreshAt = new Date();
  await tokenDoc.save();

  return tokenDoc;
}

export async function saveTokensForUser(userId, tokens) {
  const accessToken = tokens.access_token;
  if (!userId || !accessToken) return null;

  const profile = await getMe(accessToken);
  const outlookEmail =
    profile?.mail || profile?.userPrincipalName || profile?.otherMails?.[0] || "";
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : undefined;
  const tokenUpdate = {
    accessToken: encryptToken(tokens.access_token),
    scope: tokens.scope,
    tokenType: tokens.token_type,
    expiresAt,
    outlookEmail,
    microsoftUserId: profile?.id || "",
  };
  if (tokens.refresh_token) {
    tokenUpdate.refreshToken = encryptToken(tokens.refresh_token);
  }

  const tokenDoc = await OutlookToken.findOneAndUpdate(
    { userId },
    {
      $set: tokenUpdate,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const hasGoogle = Boolean(await GoogleToken.exists({ userId }));
  await User.findByIdAndUpdate(userId, {
    $set: {
      outlookConnected: true,
      outlookAccessToken: encryptToken(tokens.access_token),
      ...(tokens.refresh_token
        ? { outlookRefreshToken: encryptToken(tokens.refresh_token) }
        : {}),
      outlookEmail,
      calendarProvider: hasGoogle ? "multiple" : "outlook",
    },
  });

  return tokenDoc;
}

export async function getTokensForUser(userId) {
  if (!userId) return null;
  return OutlookToken.findOne({ userId }).select("+accessToken +refreshToken");
}

export async function getAccessTokenForUser(userId) {
  let tokenDoc = await getTokensForUser(userId);
  if (!tokenDoc) return null;

  const expiresAt = tokenDoc.expiresAt ? new Date(tokenDoc.expiresAt).getTime() : 0;
  if (!expiresAt || expiresAt - Date.now() < 5 * 60 * 1000) {
    tokenDoc = await refreshOutlookTokens(tokenDoc);
  }

  return decryptToken(tokenDoc.accessToken);
}

export async function disconnectOutlookCalendar(userId) {
  if (!userId) return false;
  const result = await OutlookToken.deleteOne({ userId });
  const hasGoogle = Boolean(await GoogleToken.exists({ userId }));
  await User.findByIdAndUpdate(userId, {
    $set: {
      outlookConnected: false,
      outlookEmail: "",
      ...(hasGoogle ? { calendarProvider: "google" } : {}),
    },
    $unset: {
      outlookAccessToken: "",
      outlookRefreshToken: "",
      ...(hasGoogle ? {} : { calendarProvider: "" }),
    },
  });
  return result.deletedCount > 0;
}

export function getUserIdFromState(state) {
  return verifyState(state)?.userId || null;
}
