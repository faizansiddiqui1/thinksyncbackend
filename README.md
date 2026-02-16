# Production-Ready Authentication & Authorization System

A comprehensive Node.js backend authentication and authorization system with multiple login methods, OTP verification, and role-based access control.

## Features

### Authentication Methods
- **Email & Password Login**: Secure password hashing with bcrypt, JWT tokens
- **Username Login**: Login using username or email
- **Phone OTP Login**: MSG91 SMS OTP verification with auto-user creation
- **Refresh Tokens**: Secure token refresh mechanism
- **Password Reset**: Forgot password and reset password flow

### Authorization (RBAC)
- **4 Built-in Roles**: `user`, `manager`, `admin`, `super_admin`
- **Custom Roles**: Super Admin can create dynamic roles with custom permissions
- **Permission-Based Access**: Fine-grained control over resources and actions
- **Role Assignment**: Assign roles using email or username

### Security Features
- Password hashing with bcrypt (12 salt rounds)
- JWT authentication (access + refresh tokens)
- Rate limiting on sensitive endpoints
- Account lockout after failed login attempts
- Input validation and sanitization
- OTP expiration and retry limits
- Helmet.js security headers
- CORS protection

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT, bcrypt
- **SMS OTP**: MSG91
- **Validation**: express-validator
- **Security**: Helmet, CORS, express-rate-limit

## Project Structure

```
src/
├── controllers/      # Request handlers
├── routes/          # API route definitions
├── models/          # MongoDB schemas
├── middlewares/     # Auth, RBAC, error handling
├── services/        # Business logic
├── utils/           # Helper functions
├── config/          # Configuration files
└── app.js          # Main application
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/auth_system
JWT_ACCESS_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret
MSG91_AUTH_KEY=your_msg91_auth_key
```

5. Start MongoDB

6. Run the server:
```bash
npm start
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login with email/username |
| POST | `/auth/refresh-token` | Refresh access token |
| POST | `/auth/logout` | Logout user |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password |
| POST | `/auth/phone/send-otp` | Send OTP to phone |
| POST | `/auth/phone/verify-otp` | Verify OTP and login |
| POST | `/auth/phone/resend-otp` | Resend OTP |

### Users

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/users/profile` | Get current user profile | Authenticated |
| PUT | `/users/profile` | Update profile | Authenticated |
| POST | `/users/change-password` | Change password | Authenticated |
| GET | `/users` | Get all users | Admin+ |
| GET | `/users/:id` | Get user by ID | Admin+ |
| PATCH | `/users/:id/deactivate` | Deactivate user | Admin+ |
| PATCH | `/users/:id/activate` | Activate user | Admin+ |

### Roles

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/roles/create` | Create custom role | Super Admin |
| GET | `/roles` | Get all roles | Super Admin |
| GET | `/roles/:id` | Get role by ID | Super Admin |
| PUT | `/roles/:id` | Update role | Super Admin |
| DELETE | `/roles/:id` | Delete role | Super Admin |
| POST | `/roles/assign` | Assign role to user | Super Admin |

## Request Examples

### Register User
```json
POST /auth/register
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123"
}
```

### Login
```json
POST /auth/login
{
  "identifier": "user@example.com",
  "password": "SecurePass123"
}
```

### Send OTP
```json
POST /auth/phone/send-otp
{
  "phoneNumber": "+1234567890"
}
```

### Verify OTP
```json
POST /auth/phone/verify-otp
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

### Create Custom Role
```json
POST /roles/create
Authorization: Bearer <super_admin_token>
{
  "name": "content_manager",
  "displayName": "Content Manager",
  "description": "Can manage content",
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

### Assign Role
```json
POST /roles/assign
Authorization: Bearer <super_admin_token>
{
  "identifier": "user@example.com",
  "role": "admin"
}
```

## Response Format

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
  "message": "Error message",
  "errors": []
}
```

## Error Messages

The system provides user-friendly error messages:

- Invalid credentials → "Email or password is incorrect"
- Unauthorized access → "You do not have permission to access this resource"
- OTP expired → "OTP has expired. Please request a new one"
- OTP invalid → "Invalid OTP. Please try again"
- User not found → "No account found with this email or phone number"
- Server error → "Something went wrong. Please try again later"

## Security Best Practices

1. **Password Security**
   - Minimum 6 characters
   - Hashed with bcrypt (12 rounds)
   - Must contain uppercase, lowercase, and number

2. **Rate Limiting**
   - General API: 100 requests per 15 minutes
   - Login: 5 attempts per 15 minutes
   - OTP: 5 requests per hour
   - Registration: 3 accounts per hour per IP

3. **Account Protection**
   - Account locked after 5 failed login attempts
   - Lock duration: 2 hours
   - Automatic session cleanup

4. **Token Management**
   - Access token: 15 minutes expiry
   - Refresh token: 7 days expiry
   - Refresh tokens stored securely

5. **OTP Security**
   - 6-digit random OTP
   - 10 minutes expiry
   - 3 verification attempts
   - Rate limited sending

## Role Hierarchy

```
super_admin (Level 4)
    ↓
admin (Level 3)
    ↓
manager (Level 2)
    ↓
user (Level 1)
```

## Super Admin Capabilities

- Create custom roles with permissions
- Assign/change user roles
- View all users
- Full system access
- Manage role permissions

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| MONGODB_URI | MongoDB connection | - |
| JWT_ACCESS_SECRET | Access token secret | - |
| JWT_REFRESH_SECRET | Refresh token secret | - |
| JWT_ACCESS_EXPIRY | Access token expiry | 15m |
| JWT_REFRESH_EXPIRY | Refresh token expiry | 7d |
| MSG91_AUTH_KEY | MSG91 API key | - |
| MSG91_SENDER_ID | SMS sender ID | VERIFY |
| OTP_EXPIRY_MINUTES | OTP validity | 10 |
| OTP_MAX_RETRIES | Max OTP attempts | 3 |

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## Notes

- Make sure MongoDB is running before starting the server
- Update all sensitive credentials in `.env` file
- For production, use strong JWT secrets
- Configure MSG91 account for OTP functionality
- Set appropriate CORS origins for production

## License

ISC
