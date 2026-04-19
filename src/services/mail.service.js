import { getActiveSMTP } from "./smtp.service.js";
import createTransporter from "../utils/createTransporter.js";

export const sendEmail = async ({ tenant, to, subject, html }) => {
  if (!to) throw new Error("Email recipient missing");
  if (!subject) throw new Error("Email subject missing");
  if (!html) throw new Error("Email html missing");

  const smtp = await getActiveSMTP(tenant);
  const transporter = createTransporter(smtp);

  await transporter.verify();

  await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to,
    subject,
    html,
  });

  return true;
};