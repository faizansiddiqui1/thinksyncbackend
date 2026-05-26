import Booking from "../models/user_models/Booking.js";
import ReviewReminder from "../models/user_models/ReviewReminder.js";
import sendEmailWithFallback from "../utils/sendEmailWithFallback.js";
import User from "../models/user_models/User.js";

const ONE_HOUR = 60 * 60 * 1000;
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

export const triggerReminders = async ({ dryRun = false } = {}) => {
  const now = new Date();

  // bookings completed and paid
  const bookings = await Booking.find({
    status: "completed",
    "payment.status": "paid",
  }).lean();

  const actions = [];

  for (const b of bookings) {
    const end = new Date(b.endDateTime || b.bookingDuration?.endDate);
    if (!end) continue;

    const reminder = await ReviewReminder.findOne({ booking: b._id }).lean();

    // send initial reminder 1+ hours after end
    if (now - end >= ONE_HOUR && !(reminder && reminder.remindersSent?.initial)) {
      actions.push({ type: "initial", booking: b });
      if (!dryRun) {
        await ReviewReminder.updateOne(
          { booking: b._id },
          { $set: { booking: b._id, user: b.user?.userId || b.user?.userId, "remindersSent.initial": true } },
          { upsert: true },
        );
        try {
          const user = b.user?.userId ? await User.findById(b.user.userId).lean() : null;
          if (user?.email) {
            await sendEmailWithFallback({
              to: user.email,
              subject: "How was your workspace experience?",
              html: `<p>Hi ${user?.name || ''},</p><p>Thanks for using our workspace. We'd love your feedback — <a href="${process.env.FRONTEND_URL}/bookings/${b._id}/review">leave a review</a>.</p>`,
            });
          }
        } catch (err) {
          console.error("initial reminder failed for booking", b._id, err.message);
        }
      }
    }

    // send final reminder after 3 days
    if (now - end >= THREE_DAYS && !(reminder && reminder.remindersSent?.final)) {
      actions.push({ type: "final", booking: b });
      if (!dryRun) {
        await ReviewReminder.updateOne(
          { booking: b._id },
          { $set: { booking: b._id, user: b.user?.userId || b.user?.userId, "remindersSent.final": true } },
          { upsert: true },
        );

        try {
          const user = b.user?.userId ? await User.findById(b.user.userId).lean() : null;
          if (user?.email) {
            await sendEmailWithFallback({
              to: user.email,
              subject: "Friendly reminder: Please review your workspace",
              html: `<p>Hi ${user?.name || ''},</p><p>This is a final reminder to share your review for your recent workspace booking — <a href="${process.env.FRONTEND_URL}/bookings/${b._id}/review">leave a review</a>.</p>`,
            });
          }
        } catch (err) {
          console.error("final reminder failed for booking", b._id, err.message);
        }
      }
    }
  }

  return { success: true, scanned: bookings.length, actions };
};

export default { triggerReminders };
