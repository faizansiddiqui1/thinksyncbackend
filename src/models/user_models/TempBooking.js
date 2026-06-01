import mongoose from "mongoose";

const tempBookingSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    default: null,
    index: true,
  },
  internalBookingId: { type: String, default: "" },
  gateway: { type: String, default: "" },
  bookingData: Object,
  mappedResources: Array,

  originalAmount: Number,
  totalAmount: Number,
  discountAmount: Number,

  couponCode: String,
  offerId: String,

  isFinalized: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("TempBooking", tempBookingSchema);
