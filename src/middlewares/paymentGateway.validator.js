// validators/paymentGateway.validator.js

export const validateGatewayPayload = (req, res, next) => {
  const { tenantId, gateway, credentials } = req.body;

  if (!tenantId || !gateway || !credentials) {
    return res.status(400).json({
      success: false,
      error: "tenantId, gateway and credentials required",
    });
  }

  if (gateway === "cashfree") {
    if (!credentials.appId || !credentials.secret) {
      return res.status(400).json({
        success: false,
        error: "Cashfree requires appId & secret",
      });
    }
  }

  if (gateway === "razorpay") {
    if (!credentials.keyId || !credentials.keySecret) {
      return res.status(400).json({
        success: false,
        error: "Razorpay requires keyId & keySecret",
      });
    }
  }

  next();
};