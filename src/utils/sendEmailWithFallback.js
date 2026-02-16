// utils/sendEmailWithFallback.js
import { getActiveSMTPs } from "../services/smtp.service.js";
import createTransporter from "./createTransporter.js";

const sendEmailWithFallback = async ({ to, subject, html }) => {
  const smtps = await getActiveSMTPs();

  if (!smtps.length) {
    throw new Error("No active SMTP configuration found");
  }

  let lastError;

  for (const smtp of smtps) {
    try {
      const transporter = createTransporter(smtp);

      await transporter.verify();

      await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`Email sent using SMTP: ${smtp.host}`);
      return true;
    } catch (error) {
      lastError = error;
      console.error(`SMTP failed (${smtp.host}):`, error.message);
    }
  }

  throw new Error(lastError?.message || "All SMTPs failed");
};

export default sendEmailWithFallback;
