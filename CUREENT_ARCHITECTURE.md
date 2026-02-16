# Project Architecture – OTP-based Passwordless Authentication
(Email / Phone Number → OTP → JWT Tokens)

Last updated: Jan 2026  
Goal: Simple, maintainable, industry-standard structure for OTP login system  
No password storage | Auto user creation on first OTP request | Role & KYC support

## Folder Structure Overview

<!-- Login architecture  -->

src/
├── config/                     # Centralized configuration & env parsing
│   └── database.js
│
├── controllers/                # Express route handlers (thin → call services)
│   └── authController.js
│
├── middleware/                 # Reusable express middlewares
│   ├── rateLimiter.js            # General + OTP-specific rate limiting
│   ├── auth.js                 # JWT verification middleware (protect routes)
│   └── errorHandler.js         # Global error handling
│
├── models/                     # Mongoose schemas
│   ├── User.js                 # Main user model (email/phone/otp/role/kyc/refreshTokens)
│   └── SMTP.js                 # SMTP server configurations (for email fallback)
│
├── routes/                     # Express route definitions
│   └── authRoutes.js          # /send-otp  &  /verify-otp
│
├── services/                   # Business logic – core of the application
│   ├── authService.js         # send OTP + verify OTP + token generation logic
│   ├── mailService.js        # High-level email sending (uses mail utils)
│   ├── smsService.js          # MSG91 / other SMS provider integration
│   └── smtpService.js         # Fetch active SMTP configs (DB or fallback env)
│
├── utils/                      # Pure helper functions (no side effects)
│   ├── jwt.js                  # sign/verify access & refresh tokens
│   ├── otpUtils.js                  # generate OTP + hash + verify
│   ├── validator.js            # isEmail(), isValidIndianPhone(), etc.
│   ├── sendEmailWithFallback.js # Try SMTP list one by one
│   └── createTransporter.js    # nodemailer transport factory
│
├── app.js                      # Express app setup, mongoose connect, routes