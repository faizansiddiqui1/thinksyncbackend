import mongoose from "mongoose";

const tempBookingSchema = new mongoose.Schema({
  orderId: String,
  bookingData: Object,
  mappedResources: Array,
  totalAmount: Number,
});

export default mongoose.model("TempBooking", tempBookingSchema);