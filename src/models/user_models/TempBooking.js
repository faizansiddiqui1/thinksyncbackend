import mongoose from "mongoose";

const tempBookingSchema = new mongoose.Schema({
  orderId: String,
  bookingData: Object,
  mappedResources: Array,

  originalAmount: Number,
  totalAmount: Number,
  discountAmount: Number,

  couponCode: String,
  offerId: String,

  isFinalized: { type: Boolean, default: false },
});

export default mongoose.model("TempBooking", tempBookingSchema);
