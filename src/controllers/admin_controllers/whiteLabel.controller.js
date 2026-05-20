import AdminProfile from "../../models/admin_models/AdminProfile.js";
import Tenant from "../../models/admin_models/tenant.model.js";
import TenantSecrets from "../../models/admin_models/TenantSecrets.js";

import PaymentGateway from "../../models/admin_models/paymentGateway.model.js";
import { encrypt } from "../../utils/crypto.util.js";

function enc(value) {
  return `enc:${encrypt(String(value))}`;
}

function normalizeDomain(domain = "") {
  return String(domain || "")
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function isFilledObject(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function buildMaskedPaymentGateway(record) {
  if (!record) return null;

  return {
    gateway: record.gateway || null,
    active: Boolean(record.active),
    env: record.credentials?.env || "sandbox",
    hasCredentials: true,
  };
}


function buildMaskedTenantSecrets(record) {
  if (!record) return null;

  return {
    hardware: record.hardware ? { provider: record.hardware.provider || null } : null,
    smtp: Boolean(record.smtp),
    aws: Boolean(record.aws),
    google: Boolean(record.google),
    msg91: Boolean(record.msg91),
  };
}

export const getMyWhiteLabelStatus = async (req, res) => {
  try {
    const admin = await AdminProfile.findOne({
      owner: req.user._id,
    }).select("whiteLabel company owner");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    return res.json({
      success: true,
      data: {
        whiteLabel: admin.whiteLabel,
        company: admin.company,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const requestWhiteLabel = async (req, res) => {
  try {
    const adminId = req.user._id;

    const admin = await AdminProfile.findOne({ owner: adminId });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    if (admin.whiteLabel?.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "White-label already approved",
      });
    }

    if (admin.whiteLabel?.status === "pending") {
      return res.status(400).json({
        success: false,
        message: "White-label request already pending",
      });
    }

    const {
      needsCustomDomain = false,
      requestedDomain = "",

      personalBranding = false,
      wantsFullCustomization = false,
      useOwnCredentials = false,

      paymentMode = "platform",
      needsHardwareAccess = false,

      businessName = "",
      businessAge = "",
      contactName = "",
      contactPhone = "",
      needsGuidance = false,
      notes = "",
    } = req.body;

    const wantsDomain = toBool(needsCustomDomain);
    const cleanedDomain = wantsDomain ? normalizeDomain(requestedDomain) : "";

    if (wantsDomain && !cleanedDomain) {
      return res.status(400).json({
        success: false,
        message: "Requested domain is required when custom domain is enabled",
      });
    }

    if (cleanedDomain) {
      const existingTenant = await Tenant.findOne({ domain: cleanedDomain });
      if (existingTenant) {
        return res.status(400).json({
          success: false,
          message: "This domain is already in use",
        });
      }
    }

    const requestPayload = wantsDomain
      ? {
          personalBranding: toBool(personalBranding),
          needsCustomDomain: true,
          requestedDomain: cleanedDomain,
          wantsFullCustomization: toBool(wantsFullCustomization),
          paymentMode:
            paymentMode === "own_gateway" ? "own_gateway" : "platform",
          useOwnCredentials: toBool(useOwnCredentials),
          needsHardwareAccess: toBool(needsHardwareAccess),
          businessName: String(businessName || "").trim(),
          businessAge: String(businessAge || "").trim(),
          contactName: String(contactName || "").trim(),
          contactPhone: String(contactPhone || "").trim(),
          needsGuidance: toBool(needsGuidance),
          notes: String(notes || "").trim(),
          submittedAt: new Date(),
        }
      : {
          personalBranding: false,
          needsCustomDomain: false,
          requestedDomain: null,
          wantsFullCustomization: false,
          paymentMode:
            paymentMode === "own_gateway" ? "own_gateway" : "platform",
          useOwnCredentials: false,
          needsHardwareAccess: toBool(needsHardwareAccess),
          businessName: "",
          businessAge: "",
          contactName: "",
          contactPhone: "",
          needsGuidance: false,
          notes: "",
          submittedAt: new Date(),
        };

    admin.whiteLabel.status = "pending";
    admin.whiteLabel.request = requestPayload;

    admin.whiteLabel.domain = {
      requestedDomain: cleanedDomain || null,
      activeDomain: null,
      verified: false,
      dnsConfigured: false,
    };

    await admin.save();

    return res.json({
      success: true,
      message: "White-label request submitted successfully",
      data: {
        whiteLabel: admin.whiteLabel,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getWhiteLabelSecrets = async (req, res) => {
  try {
    const adminProfile = await AdminProfile.findOne({
      owner: req.user._id,
    }).select("whiteLabel");

    if (!adminProfile) {
      return res.status(404).json({
        success: false,
        error: "Admin profile not found",
      });
    }

    if (adminProfile.whiteLabel?.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: "White-label not approved",
      });
    }

    const tenant = await Tenant.findOne({
      ownerId: req.user._id,
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Tenant not found",
      });
    }

    const paymentGateway = await PaymentGateway.findOne({
      tenantId: tenant._id,
      active: true,
    }).lean();

    const tenantSecrets = await TenantSecrets.findOne({
      tenantId: tenant._id,
    }).lean();

    const request = adminProfile.whiteLabel?.request || {};
    const fullInfraAccess =
      request.needsCustomDomain === true && request.useOwnCredentials === true;

    return res.json({
      success: true,
      data: {
        paymentGateway: buildMaskedPaymentGateway(paymentGateway),
        tenantSecrets: buildMaskedTenantSecrets(tenantSecrets),
        access: {
          canEditPaymentGateway: request.paymentMode === "own_gateway",
          canEditHardware: request.needsHardwareAccess === true,
          canEditFullInfra: fullInfraAccess,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

export const uploadSecrets = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const adminProfile = await AdminProfile.findOne({
      owner: ownerId,
    });

    if (!adminProfile) {
      return res.status(404).json({
        success: false,
        error: "Admin profile not found",
      });
    }

    if (adminProfile.whiteLabel?.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: "White-label not approved",
      });
    }

    const request = adminProfile.whiteLabel?.request || {};

    const allowPaymentGateway = request.paymentMode === "own_gateway";
    const allowHardware = request.needsHardwareAccess === true;
    const allowFullInfra =
      request.needsCustomDomain === true && request.useOwnCredentials === true;

    const tenant = await Tenant.findOne({
      ownerId,
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Tenant not found",
      });
    }

    const body = req.body || {};

    const paymentGatewayPayload = body.paymentGateway || null;
    const hardwarePayload = body.hardware || null;
    const smtpPayload = body.smtp || null;
    const awsPayload = body.aws || null;
    const googlePayload = body.google || null;
    const msg91Payload = body.msg91 || null;

    let paymentGatewayUpdated = false;
    const secretsToSave = {};

    if (allowPaymentGateway) {
      if (!paymentGatewayPayload || !paymentGatewayPayload.provider) {
        return res.status(400).json({
          success: false,
          error: "Payment gateway provider is required",
        });
      }

      const provider = String(paymentGatewayPayload.provider)
        .toLowerCase()
        .trim();

      if (provider !== "razorpay" && provider !== "cashfree") {
        return res.status(400).json({
          success: false,
          error: "Payment provider must be razorpay or cashfree",
        });
      }

      let credentials = {};

      if (provider === "razorpay") {
        const { keyId, keySecret, webhookSecret } =
          paymentGatewayPayload.razorpay || {};
        if (!keyId || !keySecret || !webhookSecret) {
          return res.status(400).json({
            success: false,
            error: "Razorpay requires keyId, keySecret and webhookSecret",
          });
        }

        credentials = {
          keyId: enc(keyId),
          keySecret: enc(keySecret),
          webhookSecret: enc(webhookSecret),
        };
      }

      if (provider === "cashfree") {
        const {
          appId,
          secret,
          env = "sandbox",
        } = paymentGatewayPayload.cashfree || {};
        if (!appId || !secret) {
          return res.status(400).json({
            success: false,
            error: "Cashfree requires appId and secret",
          });
        }

        credentials = {
          appId: enc(appId),
          secret: enc(secret),
          env: String(env) === "production" ? "production" : "sandbox",
        };
      }

      await PaymentGateway.findOneAndUpdate(
        { tenantId: tenant._id },
        {
          tenantId: tenant._id,
          gateway: provider,
          credentials,
          active: true,
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
        },
      );

      paymentGatewayUpdated = true;
    } else if (paymentGatewayPayload) {
      return res.status(403).json({
        success: false,
        error: "Payment gateway upload is not allowed for this account",
      });
    }

    if (allowHardware) {
      if (isFilledObject(hardwarePayload)) {
        if (
          !hardwarePayload.provider ||
          !hardwarePayload.apiKey ||
          !hardwarePayload.secret
        ) {
          return res.status(400).json({
            success: false,
            error: "Hardware requires provider, apiKey and secret",
          });
        }

        secretsToSave.hardware = {
          provider: enc(hardwarePayload.provider),
          apiKey: enc(hardwarePayload.apiKey),
          secret: enc(hardwarePayload.secret),
        };
      }
    } else if (hardwarePayload) {
      return res.status(403).json({
        success: false,
        error: "Hardware access is not allowed for this account",
      });
    }

    if (allowFullInfra) {
      if (isFilledObject(smtpPayload)) {
        const { host, port, username, password, fromName, fromEmail } =
          smtpPayload;
        if (
          !host ||
          !port ||
          !username ||
          !password ||
          !fromName ||
          !fromEmail
        ) {
          return res.status(400).json({
            success: false,
            error:
              "SMTP requires host, port, username, password, fromName and fromEmail",
          });
        }

        secretsToSave.smtp = {
          host: enc(host),
          port: enc(port),
          username: enc(username),
          password: enc(password),
          fromName: enc(fromName),
          fromEmail: enc(fromEmail),
        };
      }

      if (isFilledObject(awsPayload)) {
        const { accessKeyId, secretAccessKey, region, bucketName } = awsPayload;
        if (!accessKeyId || !secretAccessKey || !region || !bucketName) {
          return res.status(400).json({
            success: false,
            error:
              "AWS requires accessKeyId, secretAccessKey, region and bucketName",
          });
        }

        secretsToSave.aws = {
          accessKeyId: enc(accessKeyId),
          secretAccessKey: enc(secretAccessKey),
          region: enc(region),
          bucketName: enc(bucketName),
        };
      }

      if (isFilledObject(googlePayload)) {
        const { apiKey, placesComponents = "" } = googlePayload;
        if (!apiKey) {
          return res.status(400).json({
            success: false,
            error: "Google requires apiKey",
          });
        }

        secretsToSave.google = {
          apiKey: enc(apiKey),
          placesComponents: enc(placesComponents),
        };
      }

      if (isFilledObject(msg91Payload)) {
        const { authKey, senderId, route, country, templateId } = msg91Payload;
        if (!authKey || !senderId || !route || !country || !templateId) {
          return res.status(400).json({
            success: false,
            error:
              "MSG91 requires authKey, senderId, route, country and templateId",
          });
        }

        secretsToSave.msg91 = {
          authKey: enc(authKey),
          senderId: enc(senderId),
          route: enc(route),
          country: enc(country),
          templateId: enc(templateId),
        };
      }
    } else if (smtpPayload || awsPayload || googlePayload || msg91Payload) {
      return res.status(403).json({
        success: false,
        error: "Full infrastructure access is not allowed for this account",
      });
    }

    if (Object.keys(secretsToSave).length > 0) {
      await TenantSecrets.findOneAndUpdate(
        { tenantId: tenant._id },
        { $set: secretsToSave },
        { upsert: true, new: true, runValidators: true },
      );
    }

    if (!paymentGatewayUpdated && Object.keys(secretsToSave).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid secrets provided",
      });
    }

    return res.json({
      success: true,
      message: allowFullInfra
        ? "Full infrastructure secrets saved successfully"
        : "Allowed secrets saved successfully",
      access: {
        paymentGateway: allowPaymentGateway,
        hardware: allowHardware,
        fullInfra: allowFullInfra,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
