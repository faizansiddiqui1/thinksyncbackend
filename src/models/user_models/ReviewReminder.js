import mongoose from "mongoose";

const reviewReminderSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    remindersSent: {
      initial: { type: Boolean, default: false },
      final: { type: Boolean, default: false },
    },

    reviewSubmitted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.models.ReviewReminder || mongoose.model("ReviewReminder", reviewReminderSchema);
