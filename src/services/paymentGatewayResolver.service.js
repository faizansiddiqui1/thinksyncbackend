// src/services/paymentGatewayResolver.service.js
import PaymentGateway from '../models/admin_models/paymentGateway.model.js';
import { decrypt } from '../utils/crypto.util.js';

export async function resolveGateway(tenantId) {
  if (!tenantId) {
    // no tenant: use platform env
    return {
      source: 'platform',
      gateway: 'cashfree',
      credentials: {
        appId: process.env.CASHFREE_APP_ID,
        secret: process.env.CASHFREE_SECRET,
        env: process.env.CASHFREE_ENV || 'sandbox',
      }
    };
  }

  const record = await PaymentGateway.findOne({ tenantId, active: true }).lean();
  if (!record) {
    // fallback to platform
    return {
      source: 'platform',
      gateway: 'cashfree',
      credentials: {
        appId: process.env.CASHFREE_APP_ID,
        secret: process.env.CASHFREE_SECRET,
        env: process.env.CASHFREE_ENV || 'sandbox',
      }
    };
  }

  // decrypt any credential values that were stored encrypted
  const creds = {};
  for (const [k, v] of Object.entries(record.credentials || {})) {
    try {
      creds[k] = typeof v === 'string' && v.startsWith('enc:') ? decrypt(v.slice(4)) : v;
    } catch (e) {
      creds[k] = v;
    }
  }

  return {
    source: 'tenant',
    gateway: record.gateway,
    credentials: creds
  };
}