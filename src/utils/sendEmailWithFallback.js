// utils/sendEmailWithFallback.js
import { getActiveSMTP } from "../services/smtp.service.js";
import createTransporter from "./createTransporter.js";

const sendEmailWithFallback = async ({ to, subject, html }) => {
  // Use active SMTP (platform or tenant) — existing system expects a single active SMTP
  const smtp = await getActiveSMTP();
  if (!smtp || !smtp.host) {
    throw new Error("No active SMTP configuration found");
  }

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
};

export default sendEmailWithFallback;
