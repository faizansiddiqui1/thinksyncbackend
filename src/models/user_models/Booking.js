// models/user_models/Booking.js

import mongoose from "mongoose";
import PricingPlan from "../../models/admin_models/PricingPlan.js";

const { Schema } = mongoose;

const paymentAttemptSchema = new Schema(
  {
    orderId: { type: String, required: true },
    sessionId: { type: String, default: "" },
    gateway: { type: String, required: true },
    status: {
      type: String,
      enum: ["created", "processing", "paid", "failed", "expired"],
      default: "created",
    },
    failureReason: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/* =========================================================
   PRICE BREAKDOWN
========================================================= */

const priceBreakdownSchema = new Schema(
  {
    basePrice: {
      type: Number,
      required: true,
      default: 0,
    },

    gstPercentage: {
      type: Number,
      default: 18,
    },

    gstAmount: {
      type: Number,
      required: true,
      default: 0,
    },

    deposit: {
      type: Number,
      default: 0,
    },

    discount: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { _id: false },
);

/* =========================================================
   RESOURCE ITEM
========================================================= */

const resourceItemSchema = new Schema(
  {
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },

    name: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

/* =========================================================
   ADDON ITEM
========================================================= */

const addonItemSchema = new Schema(
  {
    addonId: {
      type: Schema.Types.ObjectId,
      ref: "Addon",
      required: true,
    },

    name: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

/* =========================================================
   BOOKING SCHEMA
========================================================= */

const bookingSchema = new Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    /* =========================
       USER
    ========================= */

    user: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      name: {
        type: String,
        default: "",
      },

      email: {
        type: String,
        default: "",
      },

      phone: {
        type: String,
        default: "",
      },
    },

    /* =========================
       SPACE
    ========================= */

    space: {
      type: Schema.Types.ObjectId,
      ref: "Space",
      required: true,
      index: true,
    },

    spaceType: {
      type: String,
      default: "",
    },

    /* =========================
       RESOURCES
    ========================= */

    resources: {
      type: [resourceItemSchema],
      default: [],
    },

    /* =========================
       ADDONS
    ========================= */

    addons: {
      type: [addonItemSchema],
      default: [],
    },

    /* =========================
       PLAN
    ========================= */

    plan: {
      planId: {
        type: Schema.Types.ObjectId,
        ref: "PricingPlan",
      },

      type: {
        type: String,
        enum: ["hourly", "daily", "weekly", "monthly", "yearly"],
        required: true,
      },
    },

    /* =========================
       DURATION
    ========================= */

    bookingDuration: {
      startDate: {
        type: Date,
        required: true,
      },

      endDate: {
        type: Date,
        required: true,
      },

      startTime: String,
      endTime: String,

      totalDays: {
        type: Number,
        default: 0,
      },

      totalHours: {
        type: Number,
        default: 0,
      },
    },

    bookingType: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly"],
      required: true,
      index: true,
    },

    reservationType: {
      type: String,
      enum: ["PAID_BOOKING", "PLAN_RESERVATION", "INTERNAL_BOOKING"],
      default: "PAID_BOOKING",
      index: true,
    },

    purchaseIntent: {
      type: String,
      enum: ["BOOKING", "PLAN_MEMBERSHIP"],
      default: "BOOKING",
      index: true,
    },

    planPurchase: {
      type: Schema.Types.ObjectId,
      ref: "PlanPurchase",
      default: null,
      index: true,
    },

    startDateTime: {
      type: Date,
      required: true,
      index: true,
    },

    endDateTime: {
      type: Date,
      required: true,
      index: true,
    },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },

    /* =========================
       PRICE
    ========================= */

    priceBreakdown: {
      type: priceBreakdownSchema,
      default: () => ({}),
    },

    /* =========================
       STATUS
    ========================= */

    status: {
      type: String,
      enum: [
        "draft",
        "pending_payment",
        "payment_processing",
        "pending_hold",
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "expired",
        "refunded",
        "no_show",
      ],
      default: "draft",
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    holdExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    /* =========================
       PAYMENT
    ========================= */

    payment: {
      method: {
        type: String,
        enum: ["cash", "card", "upi", "netbanking", "wallet", "internal"],
      },

      status: {
        type: String,
        enum: ["pending", "paid", "refunded", "failed"],
        default: "pending",
      },

      gateway: {
        type: String,
        default: "",
      },

      reference: String,
      transactionId: String,
      paymentSessionId: String,
      attempts: {
        type: [paymentAttemptSchema],
        default: [],
      },

      paidAt: Date,

      refundedAt: Date,

      refundAmount: {
        type: Number,
        default: 0,
      },
    },

    /* =========================
       INVOICE
    ========================= */

    invoice: {
      invoiceNumber: {
        type: String,
        unique: true,
        sparse: true,
      },

      invoiceDate: Date,

      invoiceUrl: String,
    },

    /* =========================
       CHECK IN / OUT
    ========================= */

    checkIn: {
      time: Date,

      status: {
        type: Boolean,
        default: false,
      },
    },

    checkOut: {
      time: Date,

      status: {
        type: Boolean,
        default: false,
      },
    },

    /* =========================
       NOTES
    ========================= */

    specialRequests: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    adminNotes: {
      type: String,
      default: "",
    },

    googleEventId: {
      type: String,
      default: null,
      index: true,
    },

    /* =========================
       CANCELLATION
    ========================= */

    cancellation: {
      cancelledBy: {
        type: String,
        enum: ["user", "admin", "system"],
      },

      cancelledAt: Date,

      reason: String,

      refundAmount: {
        type: Number,
        default: 0,
      },
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
      index: true,
    },

    reviewMailSent: {
      type: Boolean,
      default: false,
      index: true,
    },

    coupon: {
      code: { type: String, trim: true, uppercase: true, default: "" },
      offerId: { type: Schema.Types.ObjectId, default: null },
      discountAmount: { type: Number, default: 0 },
    },

    reviewMailSentAt: {
      type: Date,
      default: null,
      index: true,
    },

    reviewReminder24hSentAt: {
      type: Date,
      default: null,
      index: true,
    },

    reviewReminder3dSentAt: {
      type: Date,
      default: null,
      index: true,
    },

    reviewSubmitted: {
      type: Boolean,
      default: false,
      index: true,
    },

    reviewNotificationPending: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
   CALCULATE DURATION
========================================================= */

bookingSchema.methods.calculateDuration = function () {
  if (
    !this.bookingDuration?.startDate ||
    !this.bookingDuration?.endDate
  ) {
    return;
  }

  const start = new Date(this.bookingDuration.startDate);
  const end = new Date(this.bookingDuration.endDate);

  const diffMs = Math.abs(end - start);

  this.bookingDuration.totalDays = Math.ceil(
    diffMs / (1000 * 60 * 60 * 24),
  );

  this.bookingDuration.totalHours = Math.ceil(
    diffMs / (1000 * 60 * 60),
  );
};

/* =========================================================
   PRICE + VALIDATION HOOK
========================================================= */

bookingSchema.pre("validate", async function (next) {
  try {
    if (!this.payment) {
      this.payment = {};
    }

    if (this.paymentStatus && !this.payment.status) {
      this.payment.status = this.paymentStatus;
    }

    if (this.payment?.status) {
      this.paymentStatus = this.payment.status;
    }

    if (this.status === "completed" && !this.completedAt) {
      this.completedAt = new Date();
    }

    if (this.status !== "completed") {
      this.completedAt = null;
    }

    // only for new bookings
    if (!this.isNew) {
      return next();
    }

    // skip recalculation for finalized paid booking
    if (this.payment?.status === "paid") {
      return next();
    }

    // auto hold expiry
    if (!this.holdExpiresAt) {
      this.holdExpiresAt = new Date(
        Date.now() + 15 * 60 * 1000,
      );
    }

    if (!this.priceBreakdown) {
      this.priceBreakdown = {};
    }

    // calculate duration
    this.calculateDuration();

    const isPlanMembershipPurchase = this.purchaseIntent === "PLAN_MEMBERSHIP";
    let duration = 1;

    if (isPlanMembershipPurchase) {
      duration = 1;
    } else if (this.plan?.type === "hourly") {
      duration = this.bookingDuration.totalHours || 1;
    } else if (this.plan?.type === "weekly") {
      duration = Math.ceil((this.bookingDuration.totalDays || 1) / 7);
    } else if (this.plan?.type === "monthly") {
      duration = Math.ceil((this.bookingDuration.totalDays || 1) / 30);
    } else {
      duration = this.bookingDuration.totalDays || 1;
    }

    let baseAmount = 0;
    let gstPercentage = 18;

    /* =========================
       PLAN PRICE
    ========================= */

    if (this.plan?.planId) {
      const plan = await PricingPlan.findOne({
        _id: this.plan.planId,
        space: this.space,
        isActive: true,
      });

      if (!plan) {
        return next(
          new Error("Invalid pricing plan"),
        );
      }

      gstPercentage = Number(plan.gstPercentage ?? 18);
      baseAmount += Number(plan.price || 0) * duration;
    }

    /* =========================
       RESOURCE PRICE
    ========================= */

    if (Array.isArray(this.resources)) {
      this.resources.forEach((r) => {
        baseAmount +=
          Number(r.unitPrice || 0) *
          Number(r.quantity || 1) *
          duration;
      });
    }

    /* =========================
       ADDON PRICE
    ========================= */

    if (Array.isArray(this.addons)) {
      this.addons.forEach((a) => {
        baseAmount +=
          Number(a.unitPrice || 0) *
          Number(a.quantity || 1);
      });
    }

    if (!baseAmount) {
      return next(
        new Error(
          "Unable to calculate booking price",
        ),
      );
    }

    const gstAmount = Math.round(
      baseAmount * (gstPercentage / 100),
    );

    this.priceBreakdown.basePrice =
      baseAmount;

    this.priceBreakdown.gstPercentage = gstPercentage;

    this.priceBreakdown.gstAmount =
      gstAmount;

    this.priceBreakdown.deposit = 0;

    this.priceBreakdown.discount = 0;

    this.priceBreakdown.totalAmount =
      baseAmount + gstAmount;

    next();
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   RESOURCE AVAILABILITY CHECK
========================================================= */

bookingSchema.statics.checkAvailability =
  async function (
    resourceId,
    startDateTime,
    endDateTime,
    excludeBookingId = null,
  ) {
    const query = {
      "resources.resourceId": resourceId,

      status: {
        $in: [
          "draft",
          "pending_payment",
          "payment_processing",
          "pending_hold",
          "confirmed",
        ],
      },

      $or: [
        {
          status: "confirmed",
        },

        {
          holdExpiresAt: {
            $gt: new Date(),
          },
        },
      ],

      startDateTime: {
        $lt: endDateTime,
      },

      endDateTime: {
        $gt: startDateTime,
      },
    };

    if (excludeBookingId) {
      query._id = { $ne: excludeBookingId };
    }

    const conflict = await this.findOne(query);

    return {
      available: !conflict,
    };
  };

/* =========================================================
   INDEXES
========================================================= */

bookingSchema.index({
  space: 1,
  "bookingDuration.startDate": 1,
});

bookingSchema.index({
  "user.userId": 1,
  createdAt: -1,
});

bookingSchema.index({
  "payment.status": 1,
});

bookingSchema.index({
  "payment.reference": 1,
});

bookingSchema.index({
  "payment.attempts.orderId": 1,
});

bookingSchema.index({
  paymentStatus: 1,
  status: 1,
  endDateTime: 1,
});

bookingSchema.index({
  reviewMailSent: 1,
  reviewSubmitted: 1,
});

bookingSchema.virtual("isReviewEligible").get(function () {
  return (
    this.status === "completed" &&
    (this.paymentStatus === "paid" || this.payment?.status === "paid")
  );
});

/* =========================================================
   EXPORT
========================================================= */

export default mongoose.model(
  "Booking",
  bookingSchema,
);
