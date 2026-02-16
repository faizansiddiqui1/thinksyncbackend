// services/smsService.js
import axios from "axios";

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_COUNTRY = process.env.MSG91_COUNTRY;
const MSG91_OTP_TEMPLATE_ID = process.env.MSG91_OTP_TEMPLATE_ID;

export const sendSMS = async (phone, otp) => {
  if (!phone) {
    throw new Error("Phone number missing");
  }

  const payload = {
    template_id: MSG91_OTP_TEMPLATE_ID,
    mobile: `${MSG91_COUNTRY}${phone}`, // add country code ONLY here
    otp: String(otp),
  };

  const headers = {
    authkey: MSG91_AUTH_KEY,
    "Content-Type": "application/json",
  };

  await axios.post("https://api.msg91.com/api/v5/otp", payload, { headers });
};
