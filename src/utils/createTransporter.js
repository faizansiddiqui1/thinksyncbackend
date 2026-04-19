import nodemailer from "nodemailer";

const createTransporter = (smtp) => {
  const port = Number(smtp.port);
  const secure = typeof smtp.secure === "boolean" ? smtp.secure : port === 465;

  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    requireTLS: !secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
  });
};

export default createTransporter;