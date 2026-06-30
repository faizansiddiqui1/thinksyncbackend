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
import planMembershipRoutes from "./routes/planMembership.routes.js";
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
import eventSpaceRoutes from "./routes/eventSpace.routes.js"
import googleAuthRoutes from "./routes/googleAuth.routes.js";
import outlookAuthRoutes from "./routes/outlookAuth.routes.js";

import CityRoutes from "./routes/City.routes.js"

import SeatingOption from "./routes/seatingOption.routes.js"

import DocumentsRoutes from "./routes/spaceDocument.routes.js"

import AddonRoutes from "./routes/addon.routes.js"
import feedbackRoutes from "./routes/feedback.routes.js";
import adminFeedbackRoutes from "./routes/adminFeedback.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import adminMailTemplateRoutes from "./routes/adminMailTemplate.routes.js";
import securityAccessRoutes from "./routes/securityAccess.routes.js";
import savedSpaceRoutes from "./routes/savedSpace.routes.js";
import compareRoutes from "./routes/compare.routes.js";
import visitRequestRoutes from "./routes/visitRequest.routes.js";
import bookingDraftRoutes from "./routes/bookingDraft.routes.js";
import consultantRoutes from "./routes/consultant.routes.js";
import crmRoutes from "./routes/crm.routes.js";
import marketplaceContentRoutes from "./routes/marketplaceContent.routes.js";
import docsRoutes from "./routes/docs.routes.js";
import { ensureDefaultEmailTemplates } from "./services/emailTemplateRegistry.service.js";
import { startBookingCompletionCron } from "./cron/bookingCompletion.cron.js";
import { ensureGlobalKycConfig } from "./services/globalKycConfig.service.js";
import { ensureDefaultDocumentation } from "./services/documentationSeed.service.js";
import { ensureSuperAdminUser } from "./services/superAdminSeed.service.js";

import { cashfreeWebhook } from "./controllers/user_controllers/cashfreeWebhook.controller.js";

const app = express();

/* -------------------------
   Security & CORS
   ------------------------- */
   
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

function normalizeOrigin(value = "") {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

const allowedOrigins = new Set(
  [
    "http://localhost:3000",
    "http://localhost:4028",
    "https://thinksyncspace.com",
    "https://www.thinksyncspace.com",
    process.env.FRONTEND_URL,
    process.env.ADMIN_FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(","),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);

      const error = new Error("Not allowed by CORS");
      error.statusCode = 403;
      return callback(error);
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

// Google OAuth
app.use("/api/auth", googleAuthRoutes);
app.use("/api/auth", outlookAuthRoutes);



/* =========================
   ROUTES - mount with explicit prefixes (avoid param conflicts)
   ========================= */
app.use("/api", propertyRoutes); // existing file uses /spaces and /space/:slug paths

/* Media, pricing, offers, resources */
app.use("/api", spaceMediaRoutes);
app.use("/api", pricingPlanRoutes);
app.use("/api/plans", planMembershipRoutes);
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
app.use("/api/event-spaces", eventSpaceRoutes);

app.use("/api/location", CityRoutes)

app.use("/api/seatingOption", SeatingOption);

app.use("/api/addon", AddonRoutes)

// visitor & booking feedback endpoints
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin/analytics", adminFeedbackRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/super-admin/mail-templates", adminMailTemplateRoutes);
app.use("/api", crmRoutes);
app.use("/api/saved-spaces", savedSpaceRoutes);
app.use("/api/compare", compareRoutes);
app.use("/api/visit-requests", visitRequestRoutes);
app.use("/api", bookingDraftRoutes);
app.use("/api", consultantRoutes);
app.use("/api", marketplaceContentRoutes);
app.use("/api", docsRoutes);

// Vertual office documetns
app.use("/api/documents", DocumentsRoutes)

// white label routes
app.use("/api/whitelabel", whiteLabelRoutes);
app.use("/api/security-access", securityAccessRoutes);

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

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function startServer() {
  await connectDB();
  const superAdmin = await ensureSuperAdminUser();
  console.log(
    superAdmin.created
      ? `Super admin created: ${superAdmin.email}`
      : `Super admin ready: ${superAdmin.email}`,
  );
  const globalKyc = await ensureGlobalKycConfig();
  console.log(
    globalKyc.created
      ? "Global KYC config created with safe defaults"
      : "Global KYC config ready",
  );
  await ensureDefaultEmailTemplates();
  await ensureDefaultDocumentation()
    .then((docsSeed) => {
      console.log(
        docsSeed.created
          ? `Documentation seed created ${docsSeed.documentsCreated} docs`
          : "Documentation seed ready",
      );
    })
    .catch((error) => {
      console.error("Documentation seed failed:", error.message);
    });
  startBookingCompletionCron();

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Please stop the running process or set a different PORT.`);
      process.exit(1);
    }
    console.error("Server error:", error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});

console.log("========== AWS CONFIG ==========");
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log("AWS_BUCKET_NAME:", process.env.AWS_BUCKET_NAME);
console.log("================================");

export default app;
