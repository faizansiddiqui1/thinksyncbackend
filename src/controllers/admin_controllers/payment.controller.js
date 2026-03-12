// src/controllers/payment.controller.js
import express from 'express';
import { resolveGateway } from '../../services/paymentGatewayResolver.service.js';
import * as cashfreeService from '../../services/cashfree.service.js';
import * as razorpayService from '../../services/razorpay.service.js';


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