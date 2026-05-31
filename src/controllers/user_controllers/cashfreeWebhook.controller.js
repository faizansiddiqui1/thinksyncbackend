import { finalizeTempBooking } from "../../services/bookingFinalize.service.js";
import { verifyCashfreeWebhook } from "../../services/cashfree.service.js";
import { getPlatformConfigValues } from "../../services/platformConfigResolver.service.js";

export const cashfreeWebhook = async (req, res) => {
  try {
    const bodyRaw = req.body.toString();
    const runtimeConfig = await getPlatformConfigValues([
      "CASHFREE_ENV",
      "CASHFREE_CLIENT_ID",
      "CASHFREE_CLIENT_SECRET",
      "CASHFREE_BASE_URL_PROD",
      "CASHFREE_BASE_URL_TEST",
      "CASHFREE_API_VERSION",
    ]);
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (
      !verifyCashfreeWebhook({
        bodyRaw,
        signature,
        timestamp,
        secret: runtimeConfig.CASHFREE_CLIENT_SECRET,
      })
    ) {
      return res.status(401).send("invalid signature");
    }

    const data = JSON.parse(bodyRaw);

    if (data.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      return res.status(200).send("ok");
    }

    const orderId = data?.data?.order?.order_id;
    if (!orderId) {
      return res.status(200).send("ok");
    }

    const baseUrl =
      runtimeConfig.CASHFREE_ENV === "prod" ||
      runtimeConfig.CASHFREE_ENV === "production"
        ? runtimeConfig.CASHFREE_BASE_URL_PROD
        : runtimeConfig.CASHFREE_BASE_URL_TEST;

    const response = await fetch(`${baseUrl}/pg/orders/${orderId}`, {
      method: "GET",
      headers: {
        "x-client-id": runtimeConfig.CASHFREE_CLIENT_ID,
        "x-client-secret": runtimeConfig.CASHFREE_CLIENT_SECRET,
        "x-api-version": runtimeConfig.CASHFREE_API_VERSION || "2025-01-01",
      },
    });

    const orderData = await response.json();

    if (orderData.order_status !== "PAID") {
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

    return res.status(200).send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("error");
  }
};
