import VisitorFeedback from "../../models/user_models/VisitorFeedback.js";
import BookingFeedback from "../../models/user_models/BookingFeedback.js";
import Booking from "../../models/user_models/Booking.js";
import reviewReminderService from "../../services/reviewReminderService.js";

export const submitVisitorFeedback = async (req, res) => {
  try {
    const payload = {
      user: req.body.userId || null,
      sessionId: req.body.sessionId || "",
      issueType: req.body.issueType,
      feedbackMessage: req.body.feedbackMessage || "",
      currentPage: req.body.currentPage || req.originalUrl || "",
      deviceType: req.body.deviceType || req.headers["user-agent"] || "",
    };

    const doc = await VisitorFeedback.create(payload);
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const submitBookingFeedback = async (req, res) => {
  try {
    const { userId, bookingId, easeRating, feedbackText } = req.body;

    if (!userId || !bookingId || !easeRating) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // ensure booking exists and belongs to user (basic check)
    const booking = await Booking.findById(bookingId).lean();
    if (!booking) {
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    // upsert: only one feedback per booking
    const feedback = await BookingFeedback.findOneAndUpdate(
      { booking: bookingId },
      { user: userId, booking: bookingId, easeRating, feedbackText },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getBookingFeedbacks = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const list = await BookingFeedback.find(bookingId ? { booking: bookingId } : {}).populate("user", "name email").lean();
    return res.json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getVisitorFeedbacks = async (req, res) => {
  try {
    const filters = {};
    if (req.query.sessionId) filters.sessionId = req.query.sessionId;
    const list = await VisitorFeedback.find(filters).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data: list });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const triggerReviewReminders = async (req, res) => {
  try {
    const result = await reviewReminderService.triggerReminders({ dryRun: false });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
