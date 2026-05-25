import axios from "axios";
import { getCredentials } from "./credentialResolver.js";
import { getPlatformConfigValues } from "./platformConfigResolver.service.js";

function normalizeTwilioPhone(phone, countryCode = "91") {
  const raw = String(phone || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("+")) return raw;
  return `+${countryCode}${raw}`;
}

async function sendMsg91Otp(phone, otp, tenant) {
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
}

async function sendTwilioOtp(phone, otp) {
  const config = await getPlatformConfigValues([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "MSG91_COUNTRY",
  ]);

  if (
    !config.TWILIO_ACCOUNT_SID ||
    !config.TWILIO_AUTH_TOKEN ||
    !config.TWILIO_FROM_NUMBER
  ) {
    throw new Error("Twilio credentials missing");
  }

  const body = new URLSearchParams({
    To: normalizeTwilioPhone(phone, config.MSG91_COUNTRY || "91"),
    From: config.TWILIO_FROM_NUMBER,
    Body: `Your ThinkSync OTP is ${String(otp)}`,
  });

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`,
    body,
    {
      auth: {
        username: config.TWILIO_ACCOUNT_SID,
        password: config.TWILIO_AUTH_TOKEN,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
}

export const sendSMS = async (phone, otp, { tenant } = {}) => {
  if (!phone) {
    throw new Error("Phone number missing");
  }

  const { SMS_PROVIDER } = await getPlatformConfigValues(["SMS_PROVIDER"]);
  const provider = String(SMS_PROVIDER || "msg91").trim().toLowerCase();

  if (provider === "twilio") {
    await sendTwilioOtp(phone, otp);
    return true;
  }

  await sendMsg91Otp(phone, otp, tenant);
  return true;
};
