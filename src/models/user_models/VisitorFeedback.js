import mongoose from "mongoose";

const visitorFeedbackSchema = new mongoose.Schema(
  {
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
        "other",
      ],
      required: true,
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
  },
  { timestamps: true },
);

export default mongoose.models.VisitorFeedback || mongoose.model("VisitorFeedback", visitorFeedbackSchema);
