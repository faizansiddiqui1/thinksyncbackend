// services/mailService.js
import sendEmailWithFallback from '../utils/sendEmailWithFallback.js';

export const sendEmail = async ({ to, subject, html }) => {
  await sendEmailWithFallback({ to, subject, html });
};