import mongoose from "mongoose";
const { Schema } = mongoose;

const couponRedemptionSchema = new Schema(
  {
    offer: { type: Schema.Types.ObjectId, ref: "Offer", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    space: { type: Schema.Types.ObjectId, ref: "Space", required: true, index: true },
    amountAtBooking: { type: Number, required: true },
    discountGiven: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ offer: 1, user: 1 });

export default mongoose.model("CouponRedemption", couponRedemptionSchema);
 