// src/controllers/payment.controller.js
import express from 'express';
import { resolveGateway } from '../../services/paymentGatewayResolver.service.js';
import * as cashfreeService from '../../services/cashfree.service.js';
import * as razorpayService from '../../services/razorpay.service.js';

import PaymentGateway from "../../models/admin_models/paymentGateway.model.js";
import { encrypt } from "../../utils/crypto.util.js";

// helper to get tenantId (path param or header)
function getTenantId(req) {
  return req.params.tenantId || req.header('X-Tenant-Id') || null;
}

// Create payment / order

export const  CreatePayment = async (req, res) => {
  try {
    
    const tenantId = getTenantId(req);
    const { amount, currency = 'INR', customer = {}, orderId } = req.body;
    const gatewayResolved = await resolveGateway(tenantId);

    if (gatewayResolved.gateway === 'cashfree') {
      const resp = await cashfreeService.createCashfreeOrder({
        credentials: gatewayResolved.credentials,
        orderId: orderId || `order_${Date.now()}`,
        amount, currency, customer
      });
      return res.json({ ok: true, source: gatewayResolved.source, gateway: 'cashfree', data: resp });
    }

    if (gatewayResolved.gateway === 'razorpay') {
      const instance = razorpayService.createRazorpayInstance(gatewayResolved.credentials);
      const order = await razorpayService.createRazorpayOrder({
        instance, amount, currency, receipt: orderId || `rcpt_${Date.now()}`
      });
      return res.json({ ok: true, source: gatewayResolved.source, gateway: 'razorpay', data: order });
    }

    return res.status(400).json({ ok: false, message: 'Unsupported gateway' });
  } catch (err) {
    console.error('create-order err', err);
    return res.status(500).json({ ok: false, message: 'server_error', error: err.message });
  }
};


// Webhook endpoint: accept tenantId as query or header
// IMPORTANT: Read raw body for signature verification. In Express, use raw body parser for this route.
export const SignatureVerificationWebHook = async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.header('X-Tenant-Id') || null;
    const gatewayResolved = await resolveGateway(tenantId);
    const gateway = gatewayResolved.gateway;

    // Express must have given us raw body (buffer) as req.rawBody — see instruction below
    const raw = req.rawBody ?? JSON.stringify(req.body);
    if (gateway === 'cashfree') {
      const signature = req.headers['x-webhook-signature'] || req.headers['x-cf-signature'] || '';
      const secret = gatewayResolved.credentials.webhookSecret || gatewayResolved.credentials.secret;
      const verified = cashfreeService.verifyCashfreeWebhook({ bodyRaw: raw, signature, secret });
      if (!verified) return res.status(400).send('invalid signature');

      // process cashfree event
      // event parsing: req.body
      console.log('cashfree webhook', req.body);
      // TODO: update bookings/payments accordingly

      return res.status(200).send('ok');
    }

    if (gateway === 'razorpay') {
      const signature = req.headers['x-razorpay-signature'] || '';
      const secret = gatewayResolved.credentials.webhookSecret || gatewayResolved.credentials.keySecret;
      const verified = razorpayService.verifyRazorpayWebhook({ bodyRaw: raw, signature, secret });
      if (!verified) return res.status(400).send('invalid signature');

      // process razorpay event
      console.log('razorpay webhook', req.body);
      return res.status(200).send('ok');
    }

    return res.status(400).send('unsupported gateway');
  } catch (err) {
    console.error('webhook error', err);
    return res.status(500).send('server_error');
  }
};


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