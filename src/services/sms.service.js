import axios from "axios";
import { getCredentials } from "./credentialResolver.js";

export const sendSMS = async (phone, otp, { tenant } = {}) => {
  if (!phone) {
    throw new Error("Phone number missing");
  }

  const creds = await getCredentials({ tenant }, "msg91");

  if (!creds?.authKey || !creds?.templateId) {
    throw new Error("MSG91 credentials missing");
  }

  const country = creds.country || "91";

  const payload = {
    template_id: creds.templateId,
    mobile: `${country}${phone}`,
    otp: String(otp),
  };

  const headers = {
    authkey: creds.authKey,
    "Content-Type": "application/json",
  };

  await axios.post("https://api.msg91.com/api/v5/otp", payload, { headers });
};
