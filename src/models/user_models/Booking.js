// models/user_models/Booking.js (updated with price calc hook)
import mongoose, { Schema } from "mongoose";
import PricingPlan from "../../models/admin_models/PricingPlan.js"; // Assume exists

const priceBreakdownSchema = new mongoose.Schema(
  {
    basePrice: { type: Number, required: true },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, required: true },
    deposit: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
  },
  { _id: false },
);

const resourceItemSchema = new mongoose.Schema(
  {
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    type: String,
    unitPrice: { type: Number, default: 0 },
    qty: { type: Number, default: 1 },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    user: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
    },

    space: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Space",
      required: true,
    },

    // ===============================
    // ✅ RESOURCE ARRAY (FIXED)
    // ===============================
    resources: {
      type: [resourceItemSchema],
      default: [],
    },

    plan: {
      planId: { type: mongoose.Schema.Types.ObjectId },
      type: {
        type: String,
        enum: ["hourly", "daily", "monthly", "yearly"],
        required: true,
      },
    },

    bookingDuration: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      startTime: { type: String },
      endTime: { type: String },
      totalDays: { type: Number },
      totalHours: { type: Number },
    },
    bookingType: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly"],
      required: true,
      index: true,
    },
    startDateTime: { type: Date, required: true, index: true },
    endDateTime: { type: Date, required: true, index: true },
    timezone: { type: String, default: "Asia/Kolkata" },

    quantity: {
      seats: { type: Number, default: 1 },
      units: { type: Number, default: 1 },
    },

    priceBreakdown: {
      type: priceBreakdownSchema,
      default: () => ({}), // ⭐⭐⭐ FINAL FIX
    },

    status: {
      type: String,
      enum: [
        "pending_hold",
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "expired",
        "no_show",
      ],
      default: "pending_hold",
    },

    holdExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    
    payment: {
      method: {
        type: String,
        enum: ["cash", "card", "upi", "netbanking", "wallet"],
      },
      status: {
        type: String,
        enum: ["pending", "paid", "refunded", "failed"],
        default: "pending",
      },
      reference: String, // e.g., order_id from gateway
      transactionId: String,
      paidAt: Date,
      refundedAt: Date,
      refundAmount: Number,
    },

    invoice: {
      invoiceNumber: { type: String, unique: true, sparse: true },
      invoiceDate: Date,
      invoiceUrl: String,
    },

    checkIn: {
      time: Date,
      status: { type: Boolean, default: false },
    },

    checkOut: {
      time: Date,
      status: { type: Boolean, default: false },
    },

    specialRequests: String,

    cancellation: {
      cancelledBy: {
        type: String,
        enum: ["user", "admin", "system"],
      },
      cancelledAt: Date,
      reason: String,
      refundAmount: Number,
    },

    notes: String,
    adminNotes: String,
  },
  {
    timestamps: true,
  },
);

// Pre-save hook for price calc (demo integration with PricingPlan)
// ===============================
// 🔥 PRICE + VALIDATION HOOK
// ===============================
bookingSchema.pre("validate", async function (next) {
  try {
    if (!this.isNew) return next();

    // 🔥 ADD THIS LINE
    if (this.payment?.status === "paid") {
      return next(); // ✅ skip recalculation
    }

    if (!this.priceBreakdown) this.priceBreakdown = {};

    this.calculateDuration();

    const units = this.quantity?.units || 1;

    let duration = 1;
    if (this.plan?.type === "hourly") {
      duration = this.bookingDuration.totalHours || 1;
    } else {
      duration = this.bookingDuration.totalDays || 1;
    }

    let baseAmount = 0;

    if (this.plan?.planId) {
      const plan = await PricingPlan.findById(this.plan.planId);
      if (!plan) return next(new Error("Invalid pricing plan"));

      baseAmount += (plan.price || 0) * units * duration;
    }

    if (Array.isArray(this.resources)) {
      this.resources.forEach((r) => {
        baseAmount += Number(r.unitPrice || 0) * Number(r.qty || 1);
      });
    }

    if (!baseAmount)
      return next(new Error("Unable to calculate booking price"));

    const gst = Math.round(baseAmount * 0.18);

    this.priceBreakdown.basePrice = baseAmount;
    this.priceBreakdown.gstPercentage = 18;
    this.priceBreakdown.gstAmount = gst;
    this.priceBreakdown.deposit = 0;
    this.priceBreakdown.discount = 0;
    this.priceBreakdown.totalAmount = baseAmount + gst;

    next();
  } catch (err) {
    next(err);
  }
});

// ===============================
// 🔥 DURATION METHOD (FIXED)
// ===============================
bookingSchema.methods.calculateDuration = function () {
  if (!this.bookingDuration?.startDate || !this.bookingDuration?.endDate)
    return;

  const start = new Date(this.bookingDuration.startDate);
  const end = new Date(this.bookingDuration.endDate);

  const diffTime = Math.abs(end - start);

  this.bookingDuration.totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  this.bookingDuration.totalHours = Math.ceil(diffTime / (1000 * 60 * 60));
};

// ===============================
// 🔥 OVERLAP CHECK (FIXED FOR MULTI RESOURCE)
// ===============================
bookingSchema.statics.checkAvailability = async function (
  resourceId,
  startDate,
  endDate,
  requestedQty = 1,
) {
  const bookings = await this.find({
    status: "confirmed",
    "resources.resourceId": resourceId,
    "bookingDuration.startDate": { $lt: endDate },
    "bookingDuration.endDate": { $gt: startDate },
  });

  const totalBooked = bookings.reduce((sum, b) => {
    const resource = b.resources.find(
      (r) => r.resourceId.toString() === resourceId.toString(),
    );
    return sum + (resource?.qty || 0);
  }, 0);

  const Resource = mongoose.model("Resource");
  const resourceDoc = await Resource.findById(resourceId);

  const capacity = resourceDoc?.inventory?.total || 1;

  const availableUnits = capacity - totalBooked;

  return {
    available: availableUnits >= requestedQty,
    availableUnits,
    totalBooked,
    capacity,
  };
};

bookingSchema.index({ space: 1, "bookingDuration.startDate": 1 });
bookingSchema.index({ "user.userId": 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ "payment.status": 1 });
bookingSchema.index({ "invoice.invoiceNumber": 1 });

export default mongoose.model("Booking", bookingSchema);
