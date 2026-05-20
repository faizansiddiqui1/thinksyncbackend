// src/controllers/payment.controller.js
import express from 'express';
xDnsPrefetchControl

import PaymentGateway from "../../models/admin_models/paymentGateway.model.js";
import { encrypt } from "../../utils/crypto.util.js";
import { xDnsPrefetchControl } from 'helmet';




/* =========================
   SAVE / UPDATE CREDENTIALS
========================= */

export const saveGatewayCredentials = async (req, res) => {
  try {
    const { tenantId, gateway, credentials } = req.body;

    /* 🔐 encrypt credentials */
    const encryptedCreds = {};
    for (const [k, v] of Object.entries(credentials)) {
      encryptedCreds[k] = "enc:" + encrypt(String(v));
    }

    const record = await PaymentGateway.findOneAndUpdate(
      { tenantId },
      {
        gateway,
        credentials: encryptedCreds,
        active: true,
      },
      {
        new: true,
        upsert: true, // create if not exists
        setDefaultsOnInsert: true,
      }
    );

    return res.json({
      success: true,
      message: "Gateway credentials saved successfully",
      data: {
        tenantId: record.tenantId,
        gateway: record.gateway,
        active: record.active,
      },
    });

  } catch (error) {
    console.error("saveGatewayCredentials error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to save credentials",
    });
  }
};

/* =========================
   GET CREDENTIALS (masked)
========================= */

export const getGatewayConfig = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const record = await PaymentGateway.findOne({ tenantId });

    if (!record) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        gateway: record.gateway,
        active: record.active,
        credentials: Object.keys(record.credentials || {}), // masked view
      },
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};