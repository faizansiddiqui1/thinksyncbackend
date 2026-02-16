# Detailed Code Explanations

This document explains the key components and how they work together.

## Table of Contents
1. [User Model Explained](#user-model-explained)
2. [Authentication Flow](#authentication-flow)
3. [JWT Token System](#jwt-token-system)
4. [OTP System](#otp-system)
5. [RBAC System](#rbac-system)
6. [Security Features](#security-features)
7. [Error Handling](#error-handling)

---

## User Model Explained

### Password Hashing (`User.js`)

```javascript
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  if (this.password) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});
```

**What it does:**
- Automatically hashes the password before saving to database
- Only hashes if password is modified (prevents re-hashing on update)
- Uses bcrypt with 12 salt rounds for strong security

**Why it matters:**
- Passwords are NEVER stored in plain text
- Even database admins can't see user passwords
- Each password has unique salt, preventing rainbow table attacks

---

### Login Attempt Tracking

```javascript
userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000;

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};
```

**What it does:**
1. Checks if account was previously locked but time expired
2. Increments login attempt counter
3. If attempts reach 5, locks account for 2 hours
4. Automatically unlocks after lock period

**Why it matters:**
- Prevents brute force password attacks
- Automatic recovery (no admin intervention needed)
- Balance between security and user experience

---

## Authentication Flow

### Registration Process (`authService.js`)

```javascript
export const registerUser = async (userData) => {
  const { email, username, password, phoneNumber } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [
      email ? { email } : null,
      username ? { username } : null,
      phoneNumber ? { phoneNumber } : null
    ].filter(Boolean)
  });

  if (existingUser) {
    // Specific error messages
    if (existingUser.email === email) {
      throw new ApiError(409, 'An account with this email already exists');
    }
    // ... more checks
  }

  // Create user
  const user = await User.create({
    email,
    username,
    password, // Will be hashed by pre-save hook
    phoneNumber
  });

  // Generate tokens
  const tokens = generateTokenPair(user._id, user.role);

  // Store refresh token
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { token: tokens.refreshToken } },
    lastLogin: new Date()
  });

  return { user, tokens };
};
```

**Step-by-step:**
1. Extract user data from request
2. Check if user already exists (email, username, or phone)
3. If exists, return specific error message
4. Create new user (password auto-hashed)
5. Generate JWT access and refresh tokens
6. Store refresh token in database
7. Update last login timestamp
8. Return user and tokens

**Why this approach:**
- User-friendly error messages
- Multiple ways to register (email, username, phone)
- Immediate login after registration
- Refresh token stored for future use

---

### Login Process (`authService.js`)

```javascript
export const loginUser = async (identifier, password) => {
  // Find user by email or username
  const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier.toLowerCase() }
    ]
  });

  if (!user) {
    throw new ApiError(401, 'Email or password is incorrect');
  }

  // Check if account is active
  if (!user.isActive) {
    throw new ApiError(403, 'Your account has been deactivated');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw new ApiError(423, 'Account locked due to failed attempts');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    await user.incLoginAttempts(); // Increment failed attempts
    throw new ApiError(401, 'Email or password is incorrect');
  }

  // Reset login attempts on success
  await user.resetLoginAttempts();

  // Generate new tokens
  const tokens = generateTokenPair(user._id, user.role);

  // Store refresh token
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { token: tokens.refreshToken } },
    lastLogin: new Date()
  });

  return { user, tokens };
};
```

**Security features:**
1. Generic error message for invalid credentials (doesn't reveal if email exists)
2. Checks account status (active/inactive)
3. Checks if account is locked
4. Increments failed attempts on wrong password
5. Resets attempts on successful login
6. Generates fresh tokens each login

---

## JWT Token System

### Token Generation (`jwt.js`)

```javascript
export const generateTokenPair = (userId, role) => {
  const payload = { userId, role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
};

export const generateAccessToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
};
```

**Two-Token System:**

**Access Token:**
- Short-lived (15 minutes)
- Used for API requests
- Contains user ID and role
- If stolen, expires quickly

**Refresh Token:**
- Long-lived (7 days)
- Used to get new access tokens
- Stored in database
- Can be revoked

**Why two tokens:**
- Security: Access token exposed frequently, but expires fast
- UX: Refresh token keeps user logged in longer
- Control: Can revoke refresh token to logout user everywhere

---

### Token Verification (`auth.js` middleware)

```javascript
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Access token is required');
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      throw new ApiError(401, 'Your session has expired');
    }

    // Get user from database
    const user = await User.findById(decoded.userId)
      .populate('customRoles')
      .select('-password -refreshTokens');

    if (!user) {
      throw new ApiError(401, 'User no longer exists');
    }

    if (!user.isActive) {
      throw new ApiError(403, 'Your account has been deactivated');
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
```

**Process:**
1. Extract token from Authorization header
2. Verify token signature and expiration
3. Get user from database using ID from token
4. Check if user still exists and is active
5. Attach user object to request
6. Continue to next middleware/controller

**Security checks:**
- Token signature verified (can't be forged)
- Token expiration checked
- User still exists in database
- User account is active

---

## OTP System

### Sending OTP (`otpService.js`)

```javascript
export const sendOTP = async (phoneNumber, purpose = 'login') => {
  // Check if recent OTP exists
  const existingOTP = await OTP.findOne({
    phoneNumber,
    verified: false,
    expiresAt: { $gt: Date.now() }
  }).sort({ createdAt: -1 });

  if (existingOTP && !existingOTP.isExpired()) {
    const timeLeft = Math.ceil((existingOTP.expiresAt - Date.now()) / 1000 / 60);
    throw new ApiError(429, `Please wait ${timeLeft} minutes`);
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Set expiry time
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Save OTP to database
  await OTP.create({
    phoneNumber,
    otp,
    purpose,
    expiresAt
  });

  // Send via MSG91
  try {
    const response = await axios.post(`${MSG91_BASE_URL}/sendotp.php`, null, {
      params: {
        authkey: process.env.MSG91_AUTH_KEY,
        mobile: phoneNumber,
        otp: otp,
        message: `Your OTP is ${otp}. Valid for ${expiryMinutes} minutes.`
      }
    });

    if (response.data.type === 'error') {
      throw new ApiError(500, 'Failed to send OTP');
    }

    return {
      message: 'OTP sent successfully',
      expiresIn: expiryMinutes * 60
    };
  } catch (error) {
    throw new ApiError(500, 'Failed to send OTP');
  }
};
```

**Process:**
1. Check if valid OTP already exists (prevent spam)
2. Generate random 6-digit number
3. Calculate expiry time (10 minutes)
4. Save OTP to database
5. Send SMS via MSG91 API
6. Return success message

**Security features:**
- One OTP at a time per phone number
- Time-based expiration
- Rate limiting (5 per hour)
- Attempt tracking (3 tries max)

---

### Verifying OTP (`otpService.js`)

```javascript
export const verifyOTP = async (phoneNumber, otpCode) => {
  // Find latest OTP
  const otpRecord = await OTP.findOne({
    phoneNumber,
    verified: false
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    throw new ApiError(404, 'No OTP found. Please request new one');
  }

  // Check expiration
  if (otpRecord.isExpired()) {
    throw new ApiError(410, 'OTP has expired');
  }

  // Check attempts
  if (!otpRecord.canRetry()) {
    throw new ApiError(429, 'Max attempts exceeded');
  }

  // Verify OTP
  if (otpRecord.otp !== otpCode) {
    otpRecord.attempts += 1;
    await otpRecord.save();

    const attemptsLeft = otpRecord.maxAttempts - otpRecord.attempts;
    throw new ApiError(401, `Invalid OTP. ${attemptsLeft} attempts left`);
  }

  // Mark as verified
  otpRecord.verified = true;
  await otpRecord.save();

  // Find or create user
  let user = await User.findOne({ phoneNumber });

  if (!user) {
    user = await User.create({
      phoneNumber,
      phoneVerified: true,
      role: 'user'
    });
  }

  // Generate tokens
  const tokens = generateTokenPair(user._id, user.role);

  return { user, tokens };
};
```

**Process:**
1. Find latest OTP for phone number
2. Check if OTP exists
3. Check if OTP expired
4. Check if max attempts reached
5. Compare OTP codes
6. If wrong, increment attempts and return error
7. If correct, mark as verified
8. Find existing user OR create new user
9. Generate JWT tokens
10. Return user and tokens

**Auto-user creation:**
- If phone number doesn't exist, creates new user
- No password needed for phone-based accounts
- User can add email/password later

---

## RBAC System

### Role Hierarchy (`rbac.js`)

```javascript
const roleHierarchy = {
  user: 1,
  manager: 2,
  admin: 3,
  super_admin: 4
};

export const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }

    const userRoleLevel = roleHierarchy[req.user.role] || 0;
    const minRoleLevel = roleHierarchy[minRole] || 0;

    if (userRoleLevel < minRoleLevel) {
      throw new ApiError(403, 'Insufficient permissions');
    }

    next();
  };
};
```

**How it works:**
1. Each role has numeric level
2. Checks if user's level >= required level
3. Higher roles have all permissions of lower roles

**Example:**
- `requireMinRole('manager')` allows: manager, admin, super_admin
- `requireMinRole('admin')` allows: admin, super_admin

---

### Custom Permissions (`Role.js`)

```javascript
const roleSchema = new mongoose.Schema({
  name: String,
  permissions: [{
    resource: String,      // e.g., 'posts', 'comments'
    actions: [String]      // e.g., ['create', 'read', 'update', 'delete']
  }]
});

roleSchema.methods.hasPermission = function(resource, action) {
  const permission = this.permissions.find(p => p.resource === resource);
  if (!permission) return false;
  return permission.actions.includes(action) ||
         permission.actions.includes('manage');
};
```

**Custom Role Example:**
```json
{
  "name": "content_manager",
  "permissions": [
    {
      "resource": "posts",
      "actions": ["create", "read", "update", "delete"]
    },
    {
      "resource": "comments",
      "actions": ["read", "delete"]
    }
  ]
}
```

**Usage in routes:**
```javascript
router.post('/posts',
  authenticate,
  requirePermission('posts', 'create'),
  createPost
);
```

---

## Security Features

### Rate Limiting (`rateLimiter.js`)

```javascript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutes
  max: 5,                          // 5 attempts
  skipSuccessfulRequests: true,    // Don't count successful logins
  message: {
    success: false,
    message: 'Too many login attempts'
  }
});
```

**Types of limiters:**
1. **General Limiter**: 100 req/15min - Prevents API abuse
2. **Auth Limiter**: 5 attempts/15min - Prevents brute force
3. **OTP Limiter**: 5 req/hour - Prevents SMS spam
4. **Registration Limiter**: 3 accounts/hour - Prevents fake accounts

---

### Input Validation (`validators.js`)

```javascript
export const registerValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),

  validateRequest
];
```

**What it does:**
- Validates email format
- Enforces password requirements
- Sanitizes inputs (normalizeEmail)
- Returns user-friendly error messages

---

## Error Handling

### Centralized Error Handler (`errorHandler.js`)

```javascript
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Convert all errors to ApiError
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Something went wrong';
    error = new ApiError(statusCode, message);
  }

  // Handle specific error types
  if (error.name === 'ValidationError') {
    // Mongoose validation error
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    error = new ApiError(400, 'Validation failed', errors);
  }

  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyPattern)[0];
    error = new ApiError(409, `This ${field} already exists`);
  }

  // Send response
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors })
  });
};
```

**Benefits:**
1. Consistent error format across entire API
2. User-friendly error messages
3. Proper HTTP status codes
4. Development-friendly stack traces
5. No sensitive data leaked

---

### Custom Error Class (`apiResponse.js`)

```javascript
export class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.success = false;
    this.errors = errors;
  }
}
```

**Usage:**
```javascript
// In service
if (!user) {
  throw new ApiError(404, 'User not found');
}

// In controller
try {
  await someService();
} catch (error) {
  next(error);  // Passes to error handler
}
```

---

## Best Practices Implemented

1. **Separation of Concerns**: Routes → Controllers → Services → Models
2. **Security First**: Multiple layers of security
3. **User-Friendly Errors**: Clear, actionable error messages
4. **DRY Principle**: Reusable middleware and utilities
5. **Async/Await**: Modern async handling
6. **Environment Config**: All secrets in env variables
7. **Input Validation**: Validate all user inputs
8. **Error Handling**: Try-catch in all async functions
9. **Database Indexing**: Fast queries with proper indexes
10. **Token Management**: Secure JWT with refresh tokens

---

## Common Patterns

### Controller Pattern
```javascript
export const controllerFunction = async (req, res, next) => {
  try {
    // 1. Extract data from request
    const { param1, param2 } = req.body;

    // 2. Call service layer
    const result = await service.doSomething(param1, param2);

    // 3. Send response
    res.status(200).json(
      new ApiResponse(200, result, 'Success message')
    );
  } catch (error) {
    // 4. Pass errors to error handler
    next(error);
  }
};
```

### Service Pattern
```javascript
export const serviceFunction = async (data) => {
  // 1. Validate business rules
  if (!data) {
    throw new ApiError(400, 'Data is required');
  }

  // 2. Perform operations
  const result = await Model.create(data);

  // 3. Return result
  return result;
};
```

### Middleware Pattern
```javascript
export const middlewareFunction = (req, res, next) => {
  try {
    // 1. Perform checks
    if (!condition) {
      throw new ApiError(403, 'Not allowed');
    }

    // 2. Continue to next
    next();
  } catch (error) {
    // 3. Pass errors
    next(error);
  }
};
```

---

This architecture ensures scalability, maintainability, and security while providing a great developer experience.
