import { finalizeTempBooking } from "../../services/bookingFinalize.service.js";
import { verifyCashfreeWebhook } from "../../services/cashfree.service.js";
import { getPlatformConfigValues } from "../../services/platformConfigResolver.service.js";
import { markBookingPaymentAttemptFailed } from "../../services/booking.service.js";
import TempBooking from "../../models/user_models/TempBooking.js";
import { getTenantIdFromSpace } from "../../utils/getTenantIdFromSpace.js";
import { resolveGateway } from "../../services/paymentGatewayResolver.service.js";
import Booking from "../../models/user_models/Booking.js";

export const cashfreeWebhook = async (req, res) => {
  try {
    const bodyRaw = req.body.toString();
    const data = JSON.parse(bodyRaw);
    const orderId = data?.data?.order?.order_id;
    const runtimeConfig = await getPlatformConfigValues([
      "CASHFREE_ENV",
      "CASHFREE_CLIENT_ID",
      "CASHFREE_CLIENT_SECRET",
      "CASHFREE_BASE_URL_PROD",
      "CASHFREE_BASE_URL_TEST",
      "CASHFREE_API_VERSION",
    ]);
    const temp = orderId
      ? await TempBooking.findOne({ orderId }).select("bookingData.space").lean()
      : null;
    const durableBooking =
      !temp && orderId
        ? await Booking.findOne({
            $or: [
              { "payment.reference": orderId },
              { "payment.attempts.orderId": orderId },
            ],
          })
            .select("space")
            .lean()
        : null;
    const spaceId = temp?.bookingData?.space || durableBooking?.space || null;
    const tenantId = spaceId
      ? await getTenantIdFromSpace(spaceId)
      : null;
    const resolvedGateway = tenantId ? await resolveGateway(tenantId) : null;
    const credentials =
      resolvedGateway?.gateway === "cashfree"
        ? resolvedGateway.credentials
        : null;
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (
      !verifyCashfreeWebhook({
        bodyRaw,
        signature,
        timestamp,
        secret: credentials?.secret || runtimeConfig.CASHFREE_CLIENT_SECRET,
      })
    ) {
      return res.status(401).send("invalid signature");
    }

    if (data.type === "PAYMENT_FAILED_WEBHOOK") {
      await markBookingPaymentAttemptFailed(
        orderId,
        data?.data?.payment?.payment_message || "Cashfree payment failed",
      );
      return res.status(200).send("ok");
    }

    if (data.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      return res.status(200).send("ok");
    }

    if (!orderId) {
      return res.status(200).send("ok");
    }

    const baseUrl =
      credentials?.env === "prod" ||
      credentials?.env === "production" ||
      (!credentials &&
        (runtimeConfig.CASHFREE_ENV === "prod" ||
          runtimeConfig.CASHFREE_ENV === "production"))
        ? runtimeConfig.CASHFREE_BASE_URL_PROD
        : runtimeConfig.CASHFREE_BASE_URL_TEST;

    const response = await fetch(`${baseUrl}/pg/orders/${orderId}`, {
      method: "GET",
      headers: {
        "x-client-id": credentials?.appId || runtimeConfig.CASHFREE_CLIENT_ID,
        "x-client-secret": credentials?.secret || runtimeConfig.CASHFREE_CLIENT_SECRET,
        "x-api-version": runtimeConfig.CASHFREE_API_VERSION || "2025-01-01",
      },
    });

    const orderData = await response.json();

    if (orderData.order_status !== "PAID") {
      return res.status(200).send("ok");
    }

    const finalized = await finalizeTempBooking({
      orderId,
      gateway: "cashfree",
      paymentInfo: {
        transactionId: orderData?.cf_payment_id || null,
        reference: orderId,
      },
    });
    if (!finalized.success) {
      throw new Error(finalized.error || "Booking finalization failed");
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("error");
  }
};
