import cron from "node-cron";
import { runBookingCompletionCycle } from "../services/bookingCompletion.service.js";

let bookingCompletionJob = null;

export function startBookingCompletionCron() {
  if (bookingCompletionJob) {
    return bookingCompletionJob;
  }

  bookingCompletionJob = cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        const result = await runBookingCompletionCycle();

        console.log(
          "[bookingCompletionCron]",
          JSON.stringify(result),
        );
      } catch (error) {
        console.error(
          "[bookingCompletionCron] failed:",
          error.message,
        );
      }
    },
    {
      timezone: process.env.CRON_TIMEZONE || "Asia/Kolkata",
    },
  );

  return bookingCompletionJob;
}

export async function runBookingCompletionOnce() {
  return runBookingCompletionCycle();
}
