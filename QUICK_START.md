# Quick Start Guide

## Prerequisites
- Node.js (v16 or higher)
- MongoDB (v5.0 or higher)
- MSG91 account (for OTP functionality)

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/auth_system

JWT_ACCESS_SECRET=your_super_secret_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_chars

MSG91_AUTH_KEY=your_msg91_auth_key_here
MSG91_SENDER_ID=VERIFY
```

### 3. Start MongoDB
Make sure MongoDB is running:
```bash
mongod
```

Or if using MongoDB service:
```bash
sudo systemctl start mongod
```

### 4. Start the Server
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start at `http://localhost:5000`

---

## Testing the API

### Using cURL

#### 1. Register a New User
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "username": "admin",
    "password": "Admin123"
  }'
```

#### 2. Login
```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "admin@example.com",
    "password": "Admin123"
  }'
```

Save the `accessToken` from the response.

#### 3. Get Profile
```bash
curl -X GET http://localhost:5000/users/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 4. Send OTP
```bash
curl -X POST http://localhost:5000/auth/phone/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890"
  }'
```

#### 5. Verify OTP
```bash
curl -X POST http://localhost:5000/auth/phone/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "otp": "123456"
  }'
```

---

## Using Postman

### Setup
1. Import the API endpoints into Postman
2. Create an environment with variables:
   - `base_url`: `http://localhost:5000`
   - `access_token`: (will be set after login)

### Quick Test Flow

#### Step 1: Register
- Method: POST
- URL: `{{base_url}}/auth/register`
- Body (JSON):
```json
{
  "email": "test@example.com",
  "username": "testuser",
  "password": "Test123"
}
```

#### Step 2: Login
- Method: POST
- URL: `{{base_url}}/auth/login`
- Body (JSON):
```json
{
  "identifier": "test@example.com",
  "password": "Test123"
}
```

Save the `accessToken` to environment variable.

#### Step 3: Get Profile
- Method: GET
- URL: `{{base_url}}/users/profile`
- Headers:
  - `Authorization`: `Bearer {{access_token}}`

---

## Creating a Super Admin

### Method 1: Direct Database Update
Connect to MongoDB and update a user:
```javascript
use auth_system

db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "super_admin" } }
)
```

### Method 2: MongoDB Compass
1. Open MongoDB Compass
2. Connect to your database
3. Navigate to `auth_system` → `users`
4. Find your user
5. Edit the document and change `role` to `"super_admin"`
6. Save

---

## Super Admin Actions

### Create a Custom Role
```bash
curl -X POST http://localhost:5000/roles/create \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "content_manager",
    "displayName": "Content Manager",
    "description": "Can manage content and posts",
    "permissions": [
      {
        "resource": "posts",
        "actions": ["create", "read", "update", "delete"]
      }
    ]
  }'
```

### Assign Role to User
```bash
curl -X POST http://localhost:5000/roles/assign \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "role": "admin"
  }'
```

### Get All Users
```bash
curl -X GET "http://localhost:5000/users?page=1&limit=10" \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

---

## Common Workflows

### Workflow 1: Email Registration & Login
```
1. POST /auth/register
   → Get tokens
2. Use accessToken for authenticated requests
3. When token expires, POST /auth/refresh-token
   → Get new tokens
```

### Workflow 2: Phone OTP Login
```
1. POST /auth/phone/send-otp
   → User receives SMS
2. POST /auth/phone/verify-otp
   → Get tokens + auto-create user
3. Use accessToken for authenticated requests
```

### Workflow 3: Password Reset
```
1. POST /auth/forgot-password
   → Get reset token
2. POST /auth/reset-password with token
   → Password updated
3. POST /auth/login with new password
   → Get tokens
```

---

## Frontend Integration Example

### JavaScript/Fetch Example
```javascript
// Register
async function register(email, username, password) {
  const response = await fetch('http://localhost:5000/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, username, password }),
  });
  const data = await response.json();

  if (data.success) {
    // Store tokens
    localStorage.setItem('accessToken', data.data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
    return data.data.user;
  }
  throw new Error(data.message);
}

// Login
async function login(identifier, password) {
  const response = await fetch('http://localhost:5000/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await response.json();

  if (data.success) {
    localStorage.setItem('accessToken', data.data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
    return data.data.user;
  }
  throw new Error(data.message);
}

// Get Profile
async function getProfile() {
  const token = localStorage.getItem('accessToken');
  const response = await fetch('http://localhost:5000/users/profile', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const data = await response.json();

  if (data.success) {
    return data.data.user;
  }
  throw new Error(data.message);
}

// Refresh Token
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await fetch('http://localhost:5000/auth/refresh-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });
  const data = await response.json();

  if (data.success) {
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    return data.data;
  }
  throw new Error(data.message);
}

// Logout
async function logout() {
  const token = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  await fetch('http://localhost:5000/auth/logout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

// Send OTP
async function sendOTP(phoneNumber) {
  const response = await fetch('http://localhost:5000/auth/phone/send-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phoneNumber }),
  });
  const data = await response.json();

  if (data.success) {
    return data.data;
  }
  throw new Error(data.message);
}

// Verify OTP
async function verifyOTP(phoneNumber, otp) {
  const response = await fetch('http://localhost:5000/auth/phone/verify-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phoneNumber, otp }),
  });
  const data = await response.json();

  if (data.success) {
    localStorage.setItem('accessToken', data.data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.data.tokens.refreshToken);
    return data.data.user;
  }
  throw new Error(data.message);
}
```

---

## Troubleshooting

### MongoDB Connection Failed
```
Error: MongoDB connection failed
```
**Solution:** Make sure MongoDB is running and the URI in `.env` is correct.

### JWT Error
```
Error: Invalid or expired access token
```
**Solution:** Your access token has expired. Use the refresh token endpoint to get a new one.

### OTP Not Sending
```
Error: Failed to send OTP
```
**Solution:** Check your MSG91 credentials in `.env` file. Make sure your MSG91 account is active.

### Rate Limit Exceeded
```
Error: Too many requests
```
**Solution:** Wait for the rate limit window to reset or adjust rate limits in `.env`.

### Port Already in Use
```
Error: Port 5000 is already in use
```
**Solution:** Kill the process using port 5000 or change PORT in `.env`.

---

## Production Deployment

### Environment Variables for Production
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
JWT_ACCESS_SECRET=long_random_string_min_32_chars
JWT_REFRESH_SECRET=different_long_random_string_min_32_chars
MSG91_AUTH_KEY=production_key
CORS_ORIGIN=https://yourdomain.com
```

### Security Checklist
- [ ] Change all default secrets
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable MongoDB authentication
- [ ] Set appropriate CORS origins
- [ ] Use HTTPS in production
- [ ] Enable MongoDB replication
- [ ] Set up monitoring and logging
- [ ] Configure firewall rules
- [ ] Use environment variables for all secrets
- [ ] Enable rate limiting
- [ ] Regular security updates

---

## Next Steps

1. **Test All Endpoints**: Use Postman or curl to test all API endpoints
2. **Create Super Admin**: Update a user to super_admin role
3. **Integrate Frontend**: Use the JavaScript examples above
4. **Customize Roles**: Create custom roles for your application
5. **Add Features**: Extend with your business logic

## Support

For issues or questions:
1. Check the documentation files
2. Review error messages in console
3. Verify environment configuration
4. Check MongoDB connection

---

## Quick Reference

**Server URL:** http://localhost:5000
**Health Check:** http://localhost:5000/health
**API Docs:** See API_DOCUMENTATION.md
**Architecture:** See ARCHITECTURE.md

**Default Rate Limits:**
- General: 100 req/15min
- Login: 5 attempts/15min
- OTP: 5 req/hour
- Registration: 3 accounts/hour

**Token Expiry:**
- Access Token: 15 minutes
- Refresh Token: 7 days
- OTP: 10 minutes

**Built-in Roles:**
- user (Level 1)
- manager (Level 2)
- admin (Level 3)
- super_admin (Level 4)
