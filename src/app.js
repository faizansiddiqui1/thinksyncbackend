// server.js
import crypto from "crypto";
import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import "dotenv/config";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { generalRateLimiter } from "./middlewares/rateLimiter.js";
import connectDB from "./config/database.js";

import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import smtpRoutes from "./routes/smtp.routes.js";
import propertyRoutes from "./routes/space.routes.js"; // spaces
import spaceMediaRoutes from "./routes/spaceMedia.routes.js";
import pricingPlanRoutes from "./routes/pricing.routes.js";
import offersPlanRoutes from "./routes/offers.routes.js";
import resourceRoutes from "./routes/resource.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import CompanyVerificationRoutes from "./routes/companyverification.routes.js";
import BookingRoutes from "./routes/booking.routes.js";
import whiteLabelRoutes from "./routes/whiteLabel.routes.js"
import superAdminRoutes from "./routes/superAdmin.routes.js"

 
import enquiryRoutes from "./routes/enquiry.routes.js"
import onboardingRoutes from "./routes/company.routes.js"


import virtualOfficeRoutes from "./routes/virtualOfficePlan.routes.js"

import CityRoutes from "./routes/City.routes.js"

import SeatingOption from "./routes/seatingOption.routes.js"

import DocumentsRoutes from "./routes/spaceDocument.routes.js"

import AddonRoutes from "./routes/addon.routes.js"
import feedbackRoutes from "./routes/feedback.routes.js";

import { cashfreeWebhook } from "./controllers/user_controllers/cashfreeWebhook.controller.js";

const app = express();
connectDB();

/* -------------------------
   Security & CORS
   ------------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:4028",
  "http://192.168.31.110:4028/landing-page",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

// payment webhook routes for payment successfully
/* -------------------------
   🔥 CASHFREE WEBHOOK (PUT HERE)
-------------------------- */

app.post(
  "/api/payments/cashfree/webhook",
  express.raw({ type: "*/*" }), // ✅ IMPORTANT
  cashfreeWebhook,
);
/* -------------------------
   Rate limiter, cookies, body parsers
   ------------------------- */
// app.use(generalRateLimiter);
app.use(cookieParser());

app.use(express.json({ limit: "100mb" })); //
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

/* -------------------------
   Health + Root
   ------------------------- */
app.get("/", (req, res) =>
  res.json({
    success: true,
    message: "Authentication & Authorization API",
    version: "1.0.0",
  }),
);

app.get("/health", (req, res) =>
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  }),
);




app.use("/api/payout", BookingRoutes);



/* =========================
   ROUTES - mount with explicit prefixes (avoid param conflicts)
   ========================= */
app.use("/api", propertyRoutes); // existing file uses /spaces and /space/:slug paths

/* Media, pricing, offers, resources */
app.use("/api", spaceMediaRoutes);
app.use("/api", pricingPlanRoutes);
app.use("/api", offersPlanRoutes);
app.use("/api", resourceRoutes);


/* Auth / users */
app.use("/api", authRoutes);
app.use("/api/users", userRoutes);

/* Admin area */
app.use("/api", adminRoutes);
app.use("/api", superAdminRoutes);

app.use("/api/admin/smtp", smtpRoutes);
app.use("/api", CompanyVerificationRoutes);


app.use("/api/enquiries", enquiryRoutes);
app.use("/api/onboarding", onboardingRoutes)

app.use("/api/virtual-office-plans", virtualOfficeRoutes);

app.use("/api/location", CityRoutes)

app.use("/api/seatingOption", SeatingOption);

app.use("/api/addon", AddonRoutes)

// visitor & booking feedback endpoints
app.use("/api/feedback", feedbackRoutes);

// Vertual office documetns
app.use("/api/documents", DocumentsRoutes)

// white label routes
app.use("/api/whitelabel", whiteLabelRoutes);

/* -------------------------
   404 and error handler
   ------------------------- */
app.use(notFound);
app.use(errorHandler);

/* -------------------------
   Server listen
   ------------------------- */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
} else {
  app.set("trust proxy", false);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
});
export default app;