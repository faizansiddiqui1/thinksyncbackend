import crypto from "crypto";
import Booking from "../../models/user_models/Booking.js";
import TempBooking from "../../models/user_models/TempBooking.js";
import { finalizeTempBooking } from "../../services/bookingFinalize.service.js";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes - adjust if needed

export const cashfreeWebhook = async (req, res) => {
  try {
    console.log("🔥 WEBHOOK HIT");

    const data = JSON.parse(req.body.toString());

    if (data.type !== "PAYMENT_SUCCESS_WEBHOOK")
      return res.status(200).send("ok");

    const orderId = data?.data?.order?.order_id;

    console.log("ORDER:", orderId);

    // ✅ VERIFY FROM CASHFREE API (FINAL SAFE WAY)

    const response = await fetch(
      `https://sandbox.cashfree.com/pg/orders/${orderId}`,
      {
        method: "GET",
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET,
          "x-api-version": "2023-08-01",
        },
      },
    );

    const orderData = await response.json();

    console.log("VERIFY:", orderData.order_status);

    if (orderData.order_status !== "PAID") {
      console.log("❌ not paid");
      return res.status(200).send("ok");
    }

    await finalizeTempBooking({
      orderId,
      gateway: "cashfree",
      paymentInfo: {
        transactionId: orderData?.cf_payment_id || null,
        reference: orderId,
      },
    });

    console.log("🎉 BOOKING CONFIRMED:", orderId);

    res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("error");
  }
};
