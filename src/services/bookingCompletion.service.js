import Booking from "../models/user_models/Booking.js";
import { sendReviewEmail } from "./mail.service.js";

const PAID_BOOKING_FILTER = {
  $or: [
    { paymentStatus: "paid" },
    { "payment.status": "paid" },
  ],
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function normalizePaymentStatus(booking = {}) {
  return booking.paymentStatus || booking.payment?.status || "pending";
}

function isReviewEligible(booking = {}) {
  return (
    booking.status === "completed" &&
    normalizePaymentStatus(booking) === "paid" &&
    !booking.reviewSubmitted
  );
}

export async function completeExpiredBookings({
  now = new Date(),
  batchSize = 50,
} = {}) {
  const stats = {
    scanned: 0,
    completed: 0,
  };

  const expiredBookings = await Booking.find({
    status: "confirmed",
    endDateTime: { $lt: now },
  })
    .sort({ endDateTime: 1 })
    .limit(batchSize)
    .lean();

  stats.scanned = expiredBookings.length;

  for (const booking of expiredBookings) {
    const update = {
      status: "completed",
      completedAt: now,
    };

    if (
      normalizePaymentStatus(booking) === "paid" &&
      !booking.reviewSubmitted
    ) {
      update.reviewNotificationPending = true;
    }

    const result = await Booking.updateOne(
      {
        _id: booking._id,
        status: "confirmed",
      },
      {
        $set: update,
      },
    );

    if (result.modifiedCount > 0) {
      stats.completed += 1;
    }
  }

  return stats;
}

export async function dispatchPendingReviewEmails({
  batchSize = 50,
  now = new Date(),
} = {}) {
  const stats = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    failures: [],
  };

  const bookings = await Booking.find({
    status: "completed",
    ...PAID_BOOKING_FILTER,
    reviewSubmitted: false,
    reviewMailSent: false,
  })
    .sort({ endDateTime: 1 })
    .limit(batchSize)
    .lean();

  stats.scanned = bookings.length;

  for (const booking of bookings) {
    if (!isReviewEligible(booking)) {
      stats.skipped += 1;
      continue;
    }

    const lockedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: "completed",
        ...PAID_BOOKING_FILTER,
        reviewSubmitted: false,
        reviewMailSent: false,
      },
      {
        $set: {
          reviewMailSent: true,
          reviewMailSentAt: now,
          reviewNotificationPending: true,
        },
      },
      {
        new: true,
      },
    ).lean();

    if (!lockedBooking) {
      stats.skipped += 1;
      continue;
    }

    try {
      await sendReviewEmail({
        booking: lockedBooking,
        force: true,
      });
      stats.sent += 1;
    } catch (error) {
      await Booking.updateOne(
        { _id: lockedBooking._id },
        {
          $set: {
            reviewMailSent: false,
            reviewMailSentAt: null,
          },
        },
      );

      stats.failures.push({
        bookingId: String(lockedBooking._id),
        error: error.message,
      });
    }
  }

  return stats;
}

async function dispatchDueReviewReminder({
  now,
  batchSize,
  dueBefore,
  sentAtField,
  templateName,
}) {
  const stats = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    failures: [],
  };

  const bookings = await Booking.find({
    status: "completed",
    reviewSubmitted: false,
    reviewMailSent: true,
    [sentAtField]: null,
    $and: [
      PAID_BOOKING_FILTER,
      {
        $or: [
          { completedAt: { $lte: dueBefore } },
          {
            completedAt: null,
            endDateTime: { $lte: dueBefore },
          },
        ],
      },
    ],
  })
    .sort({ completedAt: 1, endDateTime: 1 })
    .limit(batchSize)
    .lean();

  stats.scanned = bookings.length;

  for (const booking of bookings) {
    const lockedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: "completed",
        ...PAID_BOOKING_FILTER,
        reviewSubmitted: false,
        [sentAtField]: null,
      },
      {
        $set: {
          [sentAtField]: now,
          reviewNotificationPending: true,
        },
      },
      {
        new: true,
      },
    ).lean();

    if (!lockedBooking) {
      stats.skipped += 1;
      continue;
    }

    try {
      await sendReviewEmail({
        booking: lockedBooking,
        force: true,
        templateName,
      });
      stats.sent += 1;
    } catch (error) {
      await Booking.updateOne(
        { _id: lockedBooking._id },
        {
          $set: {
            [sentAtField]: null,
          },
        },
      );

      stats.failures.push({
        bookingId: String(lockedBooking._id),
        error: error.message,
      });
    }
  }

  return stats;
}

export async function dispatchReviewReminderEmails({
  now = new Date(),
  batchSize = 50,
} = {}) {
  const reminder24h = await dispatchDueReviewReminder({
    now,
    batchSize,
    dueBefore: new Date(now.getTime() - DAY_MS),
    sentAtField: "reviewReminder24hSentAt",
    templateName: "booking_review_reminder_24h",
  });
  const reminder3d = await dispatchDueReviewReminder({
    now,
    batchSize,
    dueBefore: new Date(now.getTime() - 3 * DAY_MS),
    sentAtField: "reviewReminder3dSentAt",
    templateName: "booking_review_reminder_3d",
  });

  return {
    reminder24h,
    reminder3d,
  };
}

export async function runBookingCompletionCycle(options = {}) {
  const completion = await completeExpiredBookings(options);
  const reviewDispatch = await dispatchPendingReviewEmails(options);
  const reviewReminders = await dispatchReviewReminderEmails(options);

  return {
    success: true,
    completion,
    reviewDispatch,
    reviewReminders,
  };
}
