import Booking from "../models/user_models/Booking.js";
import { getTokensForUser as getGoogleTokensForUser } from "./googleAuth.service.js";
import { getTokensForUser as getOutlookTokensForUser } from "./outlookAuth.service.js";
import * as googleCalendarService from "./googleCalendar.service.js";
import * as outlookCalendarService from "./outlookCalendar.service.js";

const SYNCABLE_STATUSES = new Set(["confirmed", "pending", "pending_hold"]);

function isSyncableBooking(booking) {
  if (!booking) return false;
  if (booking.purchaseIntent === "PLAN_MEMBERSHIP") return false;
  if (!SYNCABLE_STATUSES.has(booking.status)) return false;
  if (!booking.startDateTime || !booking.endDateTime) return false;
  return new Date(booking.endDateTime) >= new Date();
}

async function hasGoogle(userId) {
  return Boolean(await getGoogleTokensForUser(userId));
}

async function hasOutlook(userId) {
  return Boolean(await getOutlookTokensForUser(userId));
}

async function runProviderSync(label, task) {
  try {
    const result = await task();
    return { provider: label, success: true, eventId: result || null };
  } catch (error) {
    console.error(`${label} calendar sync failed:`, error?.message || error);
    return { provider: label, success: false, error: error?.message || String(error) };
  }
}

export async function syncBookingToConnectedCalendars(bookingId, userId) {
  if (!bookingId || !userId) return [];
  const booking = await Booking.findById(bookingId).select(
    "_id status purchaseIntent startDateTime endDateTime googleEventId outlookEventId",
  );
  if (!isSyncableBooking(booking)) return [];

  const [googleConnected, outlookConnected] = await Promise.all([
    hasGoogle(userId),
    hasOutlook(userId),
  ]);

  const tasks = [];
  if (googleConnected) {
    tasks.push(
      runProviderSync("google", () =>
        booking.googleEventId
          ? googleCalendarService.updateEventForBooking(bookingId, userId)
          : googleCalendarService.createEventForBooking(bookingId, userId),
      ),
    );
  }
  if (outlookConnected) {
    tasks.push(
      runProviderSync("outlook", () =>
        booking.outlookEventId
          ? outlookCalendarService.updateEventForBooking(bookingId, userId)
          : outlookCalendarService.createEventForBooking(bookingId, userId),
      ),
    );
  }

  return Promise.all(tasks);
}

export async function deleteBookingFromConnectedCalendars(bookingId, userId) {
  if (!bookingId || !userId) return [];
  const booking = await Booking.findById(bookingId).select("googleEventId outlookEventId");
  if (!booking) return [];

  const tasks = [];
  if (booking.googleEventId) {
    tasks.push(
      runProviderSync("google", () =>
        googleCalendarService.deleteEventForBooking(bookingId, userId),
      ),
    );
  }
  if (booking.outlookEventId) {
    tasks.push(
      runProviderSync("outlook", () =>
        outlookCalendarService.deleteEventForBooking(bookingId, userId),
      ),
    );
  }
  return Promise.all(tasks);
}

export async function syncAllActiveBookingsForUser(userId) {
  const bookings = await Booking.find({
    "user.userId": userId,
    purchaseIntent: { $ne: "PLAN_MEMBERSHIP" },
    status: { $in: Array.from(SYNCABLE_STATUSES) },
    endDateTime: { $gte: new Date() },
  }).select("_id");

  const results = [];
  for (const booking of bookings) {
    results.push({
      bookingId: booking._id,
      providers: await syncBookingToConnectedCalendars(booking._id, userId),
    });
  }

  return {
    success: true,
    syncedCount: results.length,
    results,
  };
}
