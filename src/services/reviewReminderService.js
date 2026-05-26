import { runBookingCompletionCycle } from "./bookingCompletion.service.js";

export const triggerReminders = async () => {
  return runBookingCompletionCycle();
};

export default { triggerReminders };
