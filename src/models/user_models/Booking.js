import mongoose from 'mongoose';

const priceBreakdownSchema = new mongoose.Schema(
  {
    basePrice: { type: Number, required: true },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, required: true },
    deposit: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    user: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true }
    },

    space: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Space',
      required: true
    },

    resource: {
      resourceId: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String },
      type: { type: String }
    },

    plan: {
      planId: { type: mongoose.Schema.Types.ObjectId, required: true },
      type: {
        type: String,
        enum: ['hourly', 'daily', 'monthly', 'yearly'],
        required: true
      }
    },

    bookingDuration: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      startTime: { type: String },
      endTime: { type: String },
      totalDays: { type: Number },
      totalHours: { type: Number }
    },

    quantity: {
      seats: { type: Number, default: 1 },
      units: { type: Number, default: 1 }
    },

    priceBreakdown: {
      type: priceBreakdownSchema,
      required: true
    },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'pending'
    },

    payment: {
      method: {
        type: String,
        enum: ['cash', 'card', 'upi', 'netbanking', 'wallet']
      },
      status: {
        type: String,
        enum: ['pending', 'paid', 'refunded', 'failed'],
        default: 'pending'
      },
      transactionId: String,
      paidAt: Date,
      refundedAt: Date,
      refundAmount: Number
    },

    invoice: {
      invoiceNumber: { type: String, unique: true, sparse: true },
      invoiceDate: Date,
      invoiceUrl: String
    },

    checkIn: {
      time: Date,
      status: { type: Boolean, default: false }
    },

    checkOut: {
      time: Date,
      status: { type: Boolean, default: false }
    },

    specialRequests: String,

    cancellation: {
      cancelledBy: {
        type: String,
        enum: ['user', 'admin', 'system']
      },
      cancelledAt: Date,
      reason: String,
      refundAmount: Number
    },

    notes: String,
    adminNotes: String
  },
  {
    timestamps: true
  }
);

/* =========================
   Hooks
========================= */

bookingSchema.pre('save', function (next) {
  if (this.status === 'confirmed' && !this.invoice?.invoiceNumber) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);

    this.invoice = this.invoice || {};
    this.invoice.invoiceNumber = `INV-${timestamp}-${random}`;
    this.invoice.invoiceDate = new Date();
  }
  next();
});

/* =========================
   Instance Methods
========================= */

bookingSchema.methods.calculateDuration = function () {
  const start = new Date(this.bookingDuration.startDate);
  const end = new Date(this.bookingDuration.endDate);

  const diffTime = Math.abs(end - start);
  this.bookingDuration.totalDays = Math.ceil(
    diffTime / (1000 * 60 * 60 * 24)
  );
  this.bookingDuration.totalHours = Math.ceil(
    diffTime / (1000 * 60 * 60)
  );
};

/* =========================
   Static Methods
========================= */

bookingSchema.statics.checkOverlap = async function (
  spaceId,
  startDate,
  endDate,
  resourceId = null
) {
  const query = {
    space: spaceId,
    status: { $in: ['confirmed', 'pending'] },
    $or: [
      {
        'bookingDuration.startDate': { $lte: endDate },
        'bookingDuration.endDate': { $gte: startDate }
      }
    ]
  };

  if (resourceId) {
    query['resource.resourceId'] = resourceId;
  }

  const overlappingBookings = await this.find(query);
  return overlappingBookings.length > 0;
};

/* =========================
   Indexes
========================= */

bookingSchema.index({ space: 1, 'bookingDuration.startDate': 1 });
bookingSchema.index({ 'user.userId': 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'payment.status': 1 });
bookingSchema.index({ 'invoice.invoiceNumber': 1 });

export default mongoose.model('Booking', bookingSchema);
