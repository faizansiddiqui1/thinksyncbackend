import nodemailer from 'nodemailer';

const createTransporter = (smtp) => {
  const is465 = Number(smtp.port) === 465;

  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: is465, // 🔐 enforce rule
    auth: {
      user: smtp.username,
      pass: smtp.password
    },
    tls: {
      rejectUnauthorized: false // Gmail / dev safe
    },
    requireTLS: !is465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    pool: true,
    maxConnections: 3,
    maxMessages: 50
  });
};

export default createTransporter;
  