// models/user_models/Booking.js

import mongoose from "mongoose";
import PricingPlan from "../../models/admin_models/PricingPlan.js";

const { Schema } = mongoose;

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
        enum: ["hourly", "daily", "monthly", "yearly"],
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
        "pending_hold",
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "expired",
        "no_show",
      ],
      default: "pending_hold",
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

    let duration = 1;

    if (this.plan?.type === "hourly") {
      duration = this.bookingDuration.totalHours || 1;
    } else {
      duration = this.bookingDuration.totalDays || 1;
    }

    let baseAmount = 0;

    /* =========================
       PLAN PRICE
    ========================= */

    if (this.plan?.planId) {
      const plan = await PricingPlan.findById(
        this.plan.planId,
      );

      if (!plan) {
        return next(
          new Error("Invalid pricing plan"),
        );
      }

      baseAmount += Number(plan.price || 0) * duration;
    }

    /* =========================
       RESOURCE PRICE
    ========================= */

    if (Array.isArray(this.resources)) {
      this.resources.forEach((r) => {
        baseAmount +=
          Number(r.unitPrice || 0) *
          Number(r.quantity || 1);
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
      baseAmount * 0.18,
    );

    this.priceBreakdown.basePrice =
      baseAmount;

    this.priceBreakdown.gstPercentage = 18;

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
  ) {
    const conflict = await this.findOne({
      "resources.resourceId": resourceId,

      status: {
        $in: ["pending_hold", "confirmed"],
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
    });

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
  status: 1,
});

bookingSchema.index({
  "payment.status": 1,
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

bookingSchema.index({
  "invoice.invoiceNumber": 1,
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
