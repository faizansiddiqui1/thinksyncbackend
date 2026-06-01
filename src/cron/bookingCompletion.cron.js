import cron from "node-cron";
import { runBookingCompletionCycle } from "../services/bookingCompletion.service.js";

let bookingCompletionJob = null;
let cycleInProgress = false;

async function runScheduledCycle() {
  if (cycleInProgress) {
    return {
      success: true,
      skipped: true,
      reason: "cycle_already_in_progress",
    };
  }

  cycleInProgress = true;

  try {
    const result = await runBookingCompletionCycle();

    console.log(
      "[bookingCompletionCron]",
      JSON.stringify(result),
    );

    return result;
  } finally {
    cycleInProgress = false;
  }
}

export function startBookingCompletionCron() {
  if (bookingCompletionJob) {
    return bookingCompletionJob;
  }

  bookingCompletionJob = cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runScheduledCycle();
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

  runScheduledCycle().catch((error) => {
    console.error(
      "[bookingCompletionCron] startup cycle failed:",
      error.message,
    );
  });

  return bookingCompletionJob;
}

export async function runBookingCompletionOnce() {
  return runScheduledCycle();
}
