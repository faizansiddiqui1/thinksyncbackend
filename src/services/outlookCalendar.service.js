import Booking from "../models/user_models/Booking.js";
import OutlookToken from "../models/user_models/OutlookToken.js";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "./outlookGraph.service.js";
import { getAccessTokenForUser } from "./outlookAuth.service.js";

function buildEventSubject(booking) {
  const roomNames = (booking.resources || [])
    .map((resource) => resource.name)
    .filter(Boolean)
    .join(", ");
  const roomName = roomNames || booking.space?.name || "Workspace";
  const workspaceType = booking.spaceType || booking.bookingType || "Workspace";
  const userName = booking.user?.name || booking.user?.email || "User";
  return `${roomName} - ${workspaceType} - ${userName}`;
}

function buildEventBody(booking) {
  return {
    contentType: "HTML",
    content: [
      `<p>Booking for ${booking.space?.name || "Workspace"}</p>`,
      `<p>Booking ID: ${booking.bookingId || booking._id}</p>`,
    ].join(""),
  };
}

function buildEventPayload(booking) {
  const timeZone = booking.timezone || "Asia/Kolkata";
  return {
    subject: buildEventSubject(booking),
    body: buildEventBody(booking),
    start: {
      dateTime: new Date(booking.startDateTime).toISOString(),
      timeZone,
    },
    end: {
      dateTime: new Date(booking.endDateTime).toISOString(),
      timeZone,
    },
    location: {
      displayName: booking.space?.name || "Workspace",
    },
    attendees: [
      booking.user?.email
        ? {
            emailAddress: {
              address: booking.user.email,
              name: booking.user?.name || booking.user.email,
            },
            type: "required",
          }
        : null,
    ].filter(Boolean),
    transactionId: `thinksync-${booking._id}`,
  };
}

function markBookingSynced(booking, eventId) {
  booking.outlookEventId = eventId || booking.outlookEventId || null;
  booking.calendarProvider = booking.googleEventId ? "multiple" : "outlook";
  booking.lastSyncTime = new Date();
  booking.calendarSync = {
    ...(booking.calendarSync?.toObject?.() || booking.calendarSync || {}),
    outlook: {
      eventId: booking.outlookEventId,
      lastSyncTime: booking.lastSyncTime,
      syncStatus: "synced",
    },
  };
}

export async function createEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking) return null;

  const accessToken = await getAccessTokenForUser(userId);
  if (!accessToken) return null;

  const event = await createCalendarEvent(accessToken, buildEventPayload(booking));
  if (event?.id) {
    markBookingSynced(booking, event.id);
    await booking.save();
    await OutlookToken.updateOne({ userId }, { $set: { lastSyncTime: new Date() } });
    return event.id;
  }

  return null;
}

export async function updateEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking) return null;
  if (!booking.outlookEventId) return createEventForBooking(bookingId, userId);

  const accessToken = await getAccessTokenForUser(userId);
  if (!accessToken) return null;

  const event = await updateCalendarEvent(
    accessToken,
    booking.outlookEventId,
    buildEventPayload(booking),
  );
  markBookingSynced(booking, event?.id || booking.outlookEventId);
  await booking.save();
  await OutlookToken.updateOne({ userId }, { $set: { lastSyncTime: new Date() } });
  return booking.outlookEventId;
}

export async function deleteEventForBooking(bookingId, userId) {
  const booking = await Booking.findById(bookingId).populate("space");
  if (!booking || !booking.outlookEventId) return null;

  const accessToken = await getAccessTokenForUser(userId);
  if (!accessToken) return null;

  await deleteCalendarEvent(accessToken, booking.outlookEventId);
  booking.outlookEventId = null;
  booking.calendarProvider = booking.googleEventId ? "google" : null;
  booking.lastSyncTime = new Date();
  booking.calendarSync = {
    ...(booking.calendarSync?.toObject?.() || booking.calendarSync || {}),
    outlook: {
      eventId: null,
      lastSyncTime: booking.lastSyncTime,
      syncStatus: "deleted",
    },
  };
  await booking.save();
  await OutlookToken.updateOne({ userId }, { $set: { lastSyncTime: new Date() } });
  return true;
}
