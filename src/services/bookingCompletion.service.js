import Booking from "../models/user_models/Booking.js";
import { sendReviewEmail } from "./mail.service.js";

const PAID_BOOKING_FILTER = {
  $or: [
    { paymentStatus: "paid" },
    { "payment.status": "paid" },
  ],
};

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

export async function runBookingCompletionCycle(options = {}) {
  const completion = await completeExpiredBookings(options);
  const reviewDispatch = await dispatchPendingReviewEmails(options);

  return {
    success: true,
    completion,
    reviewDispatch,
  };
}
