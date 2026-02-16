# System Architecture

## Overview
This is a production-ready authentication and authorization system built with Node.js, Express.js, and MongoDB. The architecture follows a layered approach with clear separation of concerns.

## Architecture Layers

```
┌─────────────────────────────────────────┐
│          Client Application             │
└──────────────┬──────────────────────────┘
               │ HTTP/HTTPS
┌──────────────▼──────────────────────────┐
│         API Layer (Express)             │
│  • CORS, Helmet, Rate Limiting          │
│  • Request Parsing & Validation         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│          Routes Layer                   │
│  • /auth - Authentication               │
│  • /users - User Management             │
│  • /roles - Role Management             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Middleware Layer                 │
│  • Authentication (JWT)                 │
│  • Authorization (RBAC)                 │
│  • Validation                           │
│  • Error Handling                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Controller Layer                 │
│  • Request/Response Handling            │
│  • Input Validation                     │
│  • Response Formatting                  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Service Layer                   │
│  • Business Logic                       │
│  • Data Processing                      │
│  • External API Integration             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│          Model Layer                    │
│  • Data Validation                      │
│  • Database Schemas                     │
│  • Database Operations                  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         MongoDB Database                │
│  • Users Collection                     │
│  • Roles Collection                     │
│  • OTPs Collection                      │
└─────────────────────────────────────────┘
```

## Component Details

### 1. Routes Layer (`src/routes/`)
Defines API endpoints and maps them to controllers.

**Files:**
- `authRoutes.js` - Authentication endpoints
- `userRoutes.js` - User management endpoints
- `roleRoutes.js` - Role and admin endpoints

**Responsibilities:**
- Define HTTP methods and paths
- Apply route-specific middleware
- Connect endpoints to controllers

---

### 2. Middleware Layer (`src/middlewares/`)

#### Authentication Middleware (`auth.js`)
- Validates JWT tokens
- Extracts user information
- Handles token expiration

#### RBAC Middleware (`rbac.js`)
- Role-based access control
- Permission checking
- Hierarchical role validation

Functions:
- `requireRole(...roles)` - Requires specific role(s)
- `requireMinRole(role)` - Requires minimum role level
- `requirePermission(resource, action)` - Check custom permissions
- `isSuperAdmin` - Super admin only access

#### Rate Limiter (`rateLimiter.js`)
- General API rate limiting
- Authentication rate limiting
- OTP rate limiting
- Registration rate limiting

#### Error Handler (`errorHandler.js`)
- Centralized error handling
- User-friendly error messages
- Validation error formatting
- 404 handling

---

### 3. Controller Layer (`src/controllers/`)

**Files:**
- `authController.js` - Auth operations
- `otpController.js` - OTP operations
- `userController.js` - User operations
- `roleController.js` - Role operations

**Responsibilities:**
- Handle HTTP requests/responses
- Call service layer methods
- Format API responses
- Handle errors

---

### 4. Service Layer (`src/services/`)

**Files:**
- `authService.js` - Authentication business logic
- `otpService.js` - OTP and MSG91 integration
- `roleService.js` - Role management logic

**Responsibilities:**
- Implement business logic
- Handle data processing
- Integrate with external APIs
- Perform complex operations

---

### 5. Model Layer (`src/models/`)

**Files:**
- `User.js` - User schema and methods
- `Role.js` - Role schema and methods
- `OTP.js` - OTP schema and methods

**Key Features:**

#### User Model
- Pre-save password hashing
- Password comparison method
- Login attempt tracking
- Account locking mechanism
- Refresh token management

#### Role Model
- Permission-based access
- Custom role creation
- System roles protection

#### OTP Model
- Auto-expiration
- Attempt tracking
- TTL indexing

---

### 6. Utils Layer (`src/utils/`)

**Files:**
- `jwt.js` - JWT token generation and verification
- `apiResponse.js` - Standardized API responses
- `validators.js` - Input validation rules

---

### 7. Config Layer (`src/config/`)

**Files:**
- `database.js` - MongoDB connection

---

## Authentication Flow

### Email/Password Login
```
1. User submits credentials
2. Route receives request → authRoutes.js
3. Validation middleware validates input
4. Controller receives validated data → authController.js
5. Service authenticates user → authService.js
6. Model verifies password → User.js
7. Service generates JWT tokens → jwt.js
8. Tokens stored in database
9. Response sent to client with tokens
```

### OTP Login Flow
```
1. User requests OTP
2. Route → otpController.sendOTP
3. Service generates 6-digit OTP
4. OTP saved to database with expiry
5. MSG91 API called to send SMS
6. User submits OTP
7. Service verifies OTP → otpService.verifyOTP
8. Auto-create user if not exists
9. Generate JWT tokens
10. Return tokens to client
```

---

## Authorization Flow (RBAC)

```
1. Client sends request with JWT token
2. authenticate middleware extracts & validates token
3. User data attached to req.user
4. RBAC middleware checks permissions:
   - requireRole: Checks exact role match
   - requireMinRole: Checks role hierarchy
   - requirePermission: Checks custom permissions
   - isSuperAdmin: Super admin only
5. If authorized → Continue to controller
   If not → 403 Forbidden error
```

---

## Role Hierarchy

```
Level 4: super_admin
  ↓ Can do everything
Level 3: admin
  ↓ Can manage users, content
Level 2: manager
  ↓ Can manage limited resources
Level 1: user
  ↓ Basic access only
```

---

## Security Mechanisms

### 1. Password Security
- Bcrypt hashing with 12 salt rounds
- Password strength validation
- Never store plain passwords

### 2. JWT Security
- Separate access and refresh tokens
- Short-lived access tokens (15min)
- Refresh token rotation
- Token stored in database for revocation

### 3. Rate Limiting
- IP-based rate limiting
- Endpoint-specific limits
- Prevents brute force attacks

### 4. Account Protection
- Failed login attempt tracking
- Automatic account locking
- Time-based unlock (2 hours)

### 5. OTP Security
- Time-limited validity (10 min)
- Attempt limit (3 tries)
- Rate-limited sending
- One-time use only

### 6. Input Validation
- express-validator for all inputs
- Schema-level validation
- Sanitization of user inputs

---

## Database Schema

### Users Collection
```javascript
{
  email: String (unique, optional),
  username: String (unique, optional),
  password: String (hashed),
  phoneNumber: String (unique, optional),
  phoneVerified: Boolean,
  role: String (enum),
  customRoles: [ObjectId],
  refreshTokens: [{ token, createdAt }],
  loginAttempts: Number,
  lockUntil: Date,
  isActive: Boolean,
  timestamps
}
```

### Roles Collection
```javascript
{
  name: String (unique),
  displayName: String,
  description: String,
  permissions: [{
    resource: String,
    actions: [String]
  }],
  isSystem: Boolean,
  createdBy: ObjectId,
  timestamps
}
```

### OTPs Collection
```javascript
{
  phoneNumber: String,
  otp: String,
  purpose: String (enum),
  attempts: Number,
  maxAttempts: Number,
  verified: Boolean,
  expiresAt: Date (TTL index),
  timestamps
}
```

---

## API Response Format

### Success
```javascript
{
  success: true,
  statusCode: 200,
  message: "Operation successful",
  data: { }
}
```

### Error
```javascript
{
  success: false,
  message: "Error message",
  errors: [{ field, message }]
}
```

---

## Error Handling Strategy

1. **Route Level**: Try-catch in all async handlers
2. **Service Level**: Throw custom ApiError with status codes
3. **Middleware Level**: Global error handler catches all errors
4. **Response**: Consistent error format sent to client

---

## Environment Configuration

Required environment variables:
- `PORT` - Server port
- `MONGODB_URI` - Database connection
- `JWT_ACCESS_SECRET` - Access token secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `MSG91_AUTH_KEY` - MSG91 API key

---

## Scalability Considerations

1. **Horizontal Scaling**: Stateless JWT authentication allows multiple server instances
2. **Database Indexing**: Optimized queries with proper indexes
3. **Caching**: Ready for Redis integration for tokens/sessions
4. **Load Balancing**: Stateless design supports load balancers
5. **Microservices**: Modular architecture allows easy service extraction

---

## Future Enhancements

1. Email verification flow
2. Social OAuth (Google, Facebook, etc.)
3. Two-factor authentication (2FA)
4. Session management dashboard
5. Audit logging
6. Redis caching for tokens
7. WebSocket support for real-time notifications
8. API versioning
9. GraphQL API
10. Webhook system for events

---

## Best Practices Implemented

1. **Separation of Concerns**: Clear layer separation
2. **DRY Principle**: Reusable middleware and utilities
3. **Error Handling**: Centralized and consistent
4. **Security First**: Multiple security layers
5. **Validation**: Input validation at multiple levels
6. **Documentation**: Comprehensive inline and external docs
7. **Scalability**: Stateless and modular design
8. **Testing Ready**: Modular code easy to test
9. **Environment Config**: All secrets in env variables
10. **Rate Limiting**: Protection against abuse
