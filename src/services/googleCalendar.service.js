import { google } from "googleapis";
import GoogleToken from "../models/user_models/GoogleToken.js";
import Booking from "../models/user_models/Booking.js";
import { decryptToken, encryptToken } from "./calendarTokenCrypto.service.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/google/callback`;

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getAuthClientForUser(userId) {
  const tokensDoc = await GoogleToken.findOne({ userId });
  if (!tokensDoc) return null;

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: decryptToken(tokensDoc.accessToken),
    refresh_token: decryptToken(tokensDoc.refreshToken),
    expiry_date: tokensDoc.expiryDate
      ? new Date(tokensDoc.expiryDate).getTime()
      : undefined,
  });

  try {
    const res = await oAuth2Client.getAccessToken();
    if (res?.token && res.token !== decryptToken(tokensDoc.accessToken)) {
      tokensDoc.accessToken = encryptToken(res.token);
      await tokensDoc.save();
    }
  } catch (err) {
    console.warn("Google token refresh failed:", err?.message || err);
  }

  return oAuth2Client;
}

function buildEventSummary(booking) {
  const roomNames = (booking.resources || [])
    .map((resource) => resource.name)
    .filter(Boolean)
    .join(", ");
  const roomName = roomNames || booking.space?.name || "Workspace";
  const spaceType = booking.spaceType || booking.bookingType || "Workspace";
  const userName = booking.user?.name || booking.user?.email || "User";
  return `${roomName} - ${spaceType} - ${userName}`;
}

function buildEventPayload(booking) {
  return {
    summary: buildEventSummary(booking),
    description: `Booking for ${booking.space?.name || "Workspace"} (booking:${booking._id})`,
    start: {
      dateTime: new Date(booking.startDateTime).toISOString(),
      timeZone: booking.timezone || "Asia/Kolkata",
    },
    end: {
      dateTime: new Date(booking.endDateTime).toISOString(),
      timeZone: booking.timezone || "Asia/Kolkata",
    },
    attendees: [
      { displayName: booking.user?.name || undefined, email: booking.user?.email || undefined },
    ].filter((attendee) => attendee.email),
  };
}

function markBookingSynced(booking, eventId) {
  booking.googleEventId = eventId || booking.googleEventId || null;
  booking.calendarProvider = booking.outlookEventId ? "multiple" : "google";
  booking.lastSyncTime = new Date();
  booking.calendarSync = {
    ...(booking.calendarSync?.toObject?.() || booking.calendarSync || {}),
    google: {
      eventId: booking.googleEventId,
      lastSyncTime: booking.lastSyncTime,
      syncStatus: "synced",
    },
  };
}

export async function createEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking) return null;

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: buildEventPayload(booking),
  });

  if (res?.data?.id) {
    markBookingSynced(booking, res.data.id);
    await booking.save();
    return res.data.id;
  }

  return null;
}

export async function updateEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking) return null;
  if (!booking.googleEventId) return createEventForBooking(bookingId, userId);

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.update({
    calendarId: "primary",
    eventId: booking.googleEventId,
    requestBody: buildEventPayload(booking),
  });

  markBookingSynced(booking, res?.data?.id || booking.googleEventId);
  await booking.save();
  return booking.googleEventId;
}

export async function deleteEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking || !booking.googleEventId) return null;

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: booking.googleEventId,
    });
  } catch (err) {
    if (err?.code !== 404 && err?.response?.status !== 404) {
      throw err;
    }
  }

  booking.googleEventId = null;
  booking.calendarProvider = booking.outlookEventId ? "outlook" : null;
  booking.lastSyncTime = new Date();
  booking.calendarSync = {
    ...(booking.calendarSync?.toObject?.() || booking.calendarSync || {}),
    google: {
      eventId: null,
      lastSyncTime: booking.lastSyncTime,
      syncStatus: "deleted",
    },
  };
  await booking.save();
  return true;
}
