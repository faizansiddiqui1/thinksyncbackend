import mongoose from "mongoose";

const bookingFeedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    easeRating: {
      type: String,
      enum: ["very_easy", "good", "confusing", "had_issues"],
      required: true,
    },

    feedbackText: {
      type: String,
      default: "",
      maxlength: 2000,
    },
  },
  { timestamps: true },
);

// one feedback per booking
bookingFeedbackSchema.index({ booking: 1 }, { unique: true });

export default mongoose.models.BookingFeedback || mongoose.model("BookingFeedback", bookingFeedbackSchema);
