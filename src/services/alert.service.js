import { sendEmail } from "./mail.service.js";

export const sendNewDeviceLoginAlert = async ({
  email,
  ip,
  userAgent,
  time,
}) => {
  await sendEmail({
    to: email,
    subject: "⚠️ New Device Login Detected",
    html: ` 
      <h3>New device login detected</h3>
      <p><strong>IP:</strong> ${ip}</p>
      <p><strong>Device:</strong> ${userAgent}</p>
      <p><strong>Time:</strong> ${time.toUTCString()}</p>
      <p>If this was not you, please secure your account immediately.</p>
      <a href="https://thinksyncspace.com/security">Secure my account</a>
    `,
  });
};
