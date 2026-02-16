import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { generalRateLimiter } from "./middlewares/rateLimiter.js";
import connectDB from "./config/database.js";

// uncheacked routes 
import roleRoutes from "./routes/role.routes.js";
import userRoutes from "./routes/user.routes.js";

// cheacked working routes
import authRoutes from "./routes/auth.routes.js";
import smtpRoutes from "./routes/smtp.routes.js";
import propertyRoutes from "./routes/space.routes.js";
import spaceMediaRoutes from "./routes/spaceMedia.routes.js"
import pricingPlanRoutes from "./routes/pricing.routes.js"
import offersPlanRoutes from "./routes/offers.routes.js"

import resourceRoutes from "./routes/resource.routes.js";


dotenv.config();

const app = express();

connectDB();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: 'http://localhost:3000' || process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["set-cookie"],
  }),
);

// rate limiter
app.use(generalRateLimiter);

app.use(cookieParser());

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Authentication & Authorization API",
    version: "1.0.0",
    endpoints: {
      auth: "/auth",
      users: "/users",
      roles: "/roles",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// start here
app.use("/auth", authRoutes);
app.use("/users", userRoutes);

app.use("/admin/smtp/", smtpRoutes)

// Roles create
app.use("/api", roleRoutes);

// Property routes
app.use("/api", propertyRoutes);

// Space Media Routes
app.use("/api", spaceMediaRoutes);

// Pricing plan routes
app.use("/api", pricingPlanRoutes)

// Offers Routes
app.use("/api", offersPlanRoutes)

// Resource Routes
app.use("/api", resourceRoutes);

app.use(notFound);  
app.use(errorHandler);

if (process.env.NODE_ENV === "production") {
  // trust first proxy (nginx / load balancer)
  app.set("trust proxy", 1);
} else {
  // localhost / dev
  app.set("trust proxy", false);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Access the API at: http://localhost:${PORT}`);
});

export default app;
