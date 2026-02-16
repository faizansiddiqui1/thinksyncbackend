# API Documentation

## Table of Contents
- [Authentication Endpoints](#authentication-endpoints)
- [User Endpoints](#user-endpoints)
- [Role & Admin Endpoints](#role--admin-endpoints)
- [Response Formats](#response-formats)
- [Error Codes](#error-codes)

## Base URL
```
http://localhost:5000
```

---

## Authentication Endpoints

### 1. Register User
Create a new user account with email/username and password.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123",
  "phoneNumber": "+1234567890"
}
```

**Required Fields:** At least one of (email, username, phoneNumber) + password

**Success Response:** `201 Created`
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created successfully",
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "user",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

---

### 2. Login
Login with email or username and password.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "user": { },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

**Error Responses:**
- `401` - Email or password is incorrect
- `403` - Account deactivated
- `423` - Account locked

---

### 3. Refresh Token
Get a new access token using refresh token.

**Endpoint:** `POST /auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

### 4. Logout
Logout and invalidate refresh token.

**Endpoint:** `POST /auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Success Response:** `200 OK`

---

### 5. Send OTP
Send OTP to phone number for login/registration.

**Endpoint:** `POST /auth/phone/send-otp`

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "message": "OTP sent successfully",
    "expiresIn": 600
  }
}
```

**Rate Limit:** 5 requests per hour

---

### 6. Verify OTP
Verify OTP and login (auto-creates user if not exists).

**Endpoint:** `POST /auth/phone/verify-otp`

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "user": { },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    }
  }
}
```

**Error Responses:**
- `401` - Invalid OTP
- `410` - OTP expired
- `429` - Max attempts exceeded

---

### 7. Forgot Password
Request password reset token.

**Endpoint:** `POST /auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset link has been sent to your email",
  "data": {
    "resetToken": "reset_token_here"
  }
}
```

---

### 8. Reset Password
Reset password using reset token.

**Endpoint:** `POST /auth/reset-password`

**Request Body:**
```json
{
  "token": "reset_token",
  "newPassword": "NewSecurePass123"
}
```

**Success Response:** `200 OK`

---

## User Endpoints

### 1. Get Profile
Get current user profile.

**Endpoint:** `GET /users/profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@example.com",
      "username": "johndoe",
      "role": "user",
      "customRoles": [],
      "isActive": true
    }
  }
}
```

---

### 2. Update Profile
Update user profile information.

**Endpoint:** `PUT /users/profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "email": "newemail@example.com",
  "username": "newusername",
  "phoneNumber": "+1234567890"
}
```

**Success Response:** `200 OK`

---

### 3. Change Password
Change user password.

**Endpoint:** `POST /users/change-password`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword123"
}
```

**Success Response:** `200 OK`

---

### 4. Get All Users (Admin)
Get list of all users with pagination.

**Endpoint:** `GET /users?page=1&limit=10&role=user&search=john`

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Access:** Admin, Super Admin

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "users": [],
    "totalPages": 5,
    "currentPage": 1,
    "totalUsers": 50
  }
}
```

---

## Role & Admin Endpoints

### 1. Create Role (Super Admin)
Create a custom role with permissions.

**Endpoint:** `POST /roles/create`

**Headers:**
```
Authorization: Bearer <super_admin_token>
```

**Request Body:**
```json
{
  "name": "content_manager",
  "displayName": "Content Manager",
  "description": "Manages content and posts",
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

**Available Actions:** `create`, `read`, `update`, `delete`, `manage`

**Success Response:** `201 Created`

---

### 2. Get All Roles
Get list of all roles.

**Endpoint:** `GET /roles`

**Headers:**
```
Authorization: Bearer <super_admin_token>
```

**Success Response:** `200 OK`

---

### 3. Assign Role to User
Assign a role to user by email or username.

**Endpoint:** `POST /roles/assign`

**Headers:**
```
Authorization: Bearer <super_admin_token>
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "role": "admin"
}
```

**Valid Roles:** `user`, `manager`, `admin`, `super_admin`, or custom role name

**Success Response:** `200 OK`

---

### 4. Deactivate User
Deactivate a user account.

**Endpoint:** `PATCH /users/:id/deactivate`

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Access:** Admin, Super Admin

**Success Response:** `200 OK`

---

## Response Formats

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email"
    }
  ]
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid credentials |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource already exists |
| 410 | Gone - Resource expired (OTP) |
| 423 | Locked - Account locked |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 requests / 15 min |
| Login | 5 attempts / 15 min |
| OTP Send | 5 requests / hour |
| Registration | 3 accounts / hour per IP |

---

## Authentication

Include the access token in the Authorization header:
```
Authorization: Bearer <access_token>
```

Access tokens expire in 15 minutes. Use refresh token to get a new access token.

---

## Notes

1. All timestamps are in ISO 8601 format
2. All phone numbers should include country code
3. Passwords must be at least 6 characters with uppercase, lowercase, and number
4. OTP is valid for 10 minutes with 3 verification attempts
5. Account locks automatically after 5 failed login attempts for 2 hours
