import { sendSecurityAlertEmail } from "./mail.service.js";

export const sendNewDeviceLoginAlert = async ({
  email,
  ip,
  userAgent,
  time,
}) => {
  await sendSecurityAlertEmail({
    to: email,
    ip,
    userAgent,
    time,
    secureAccountLink: "https://thinksyncspace.com/security",
  });
};
