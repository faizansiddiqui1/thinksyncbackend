import mongoose from "mongoose";

const visitorFeedbackSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["visitor", "booking"],
      default: "visitor",
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    sessionId: {
      type: String,
      default: "",
      index: true,
    },

    issueType: {
      type: String,
      enum: [
        "cant_find",
        "pricing_confusion",
        "search_filter",
        "technical_issue",
        "booking_ux",
        "general_feedback",
        "other",
      ],
      required: true,
      index: true,
    },

    feedbackMessage: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    currentPage: {
      type: String,
      default: "",
    },

    deviceType: {
      type: String,
      default: "",
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },

    easeRating: {
      type: String,
      enum: ["very_easy", "good", "confusing", "had_issues", ""],
      default: "",
    },

    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

visitorFeedbackSchema.index({
  source: 1,
  issueType: 1,
  resolved: 1,
  createdAt: -1,
});

export default mongoose.models.VisitorFeedback || mongoose.model("VisitorFeedback", visitorFeedbackSchema);
