import { google } from "googleapis";
import GoogleToken from "../models/user_models/GoogleToken.js";
import Booking from "../models/user_models/Booking.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/google/callback`;

function getOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getAuthClientForUser(userId) {
  const tokensDoc = await GoogleToken.findOne({ userId });
  if (!tokensDoc) return null;

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({
    access_token: tokensDoc.accessToken,
    refresh_token: tokensDoc.refreshToken,
    expiry_date: tokensDoc.expiryDate ? new Date(tokensDoc.expiryDate).getTime() : undefined,
  });

  // refresh if needed
  try {
    const res = await oAuth2Client.getAccessToken();
    if (res && res.token) {
      // update stored token if different
      if (res.token !== tokensDoc.accessToken) {
        tokensDoc.accessToken = res.token;
        await tokensDoc.save();
      }
    }
  } catch (err) {
    // ignore
  }

  return oAuth2Client;
}

function buildEventSummary(booking) {
  const roomNames = (booking.resources || []).map((r) => r.name).join(", ");
  const spaceType = booking.spaceType || "space";
  const userName = booking.user?.name || booking.user?.email || "User";
  return `${roomNames} • ${spaceType} • ${userName}`;
}

export async function createEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking) return null;

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });

  const event = {
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
    ].filter((a) => a.email),
  };

  const res = await calendar.events.insert({ calendarId: "primary", requestBody: event });
  if (res && res.data && res.data.id) {
    booking.googleEventId = res.data.id;
    await booking.save();
    return res.data.id;
  }

  return null;
}

export async function updateEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking || !booking.googleEventId) return null;

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });

  const event = {
    summary: buildEventSummary(booking),
    description: `Booking for ${booking.space?.name || "Workspace"} (booking:${booking._id})`,
    start: { dateTime: new Date(booking.startDateTime).toISOString(), timeZone: booking.timezone || "Asia/Kolkata" },
    end: { dateTime: new Date(booking.endDateTime).toISOString(), timeZone: booking.timezone || "Asia/Kolkata" },
  };

  const res = await calendar.events.update({ calendarId: "primary", eventId: booking.googleEventId, requestBody: event });
  return res?.data?.id || null;
}

export async function deleteEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking || !booking.googleEventId) return null;

  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });

  try {
    await calendar.events.delete({ calendarId: "primary", eventId: booking.googleEventId });
  } catch (err) {
    // ignore not found
  }

  booking.googleEventId = null;
  await booking.save();
  return true;
}
