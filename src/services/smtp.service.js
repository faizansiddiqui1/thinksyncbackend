// services/smtpService.js
import SMTP from '../models/super_admin_models/SMTP.model.js';

export const getActiveSMTPs = async () => {
  const smtps = await SMTP.find({ isActive: true }).sort({ priority: 1 }).lean();
  if (smtps.length) return smtps;

  if (process.env.DEFAULT_SMTP_HOST) {
    return [{ 
      host: process.env.DEFAULT_SMTP_HOST,
      port: Number(process.env.DEFAULT_SMTP_PORT || 587),
      secure: false,
      username: process.env.DEFAULT_SMTP_USER,
      password: process.env.DEFAULT_SMTP_PASS,
      fromName: process.env.DEFAULT_FROM_NAME || 'Your App',
      fromEmail: process.env.DEFAULT_FROM_EMAIL || process.env.DEFAULT_SMTP_USER
    }];
  }

  return [];
};