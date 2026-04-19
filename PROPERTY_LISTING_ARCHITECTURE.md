# System Architecture

## Overview

This workspace booking system follows a layered architecture pattern with clear separation of concerns, making it scalable, maintainable, and testable.

## Architecture Layers

```
┌─────────────────────────────────────┐
│         API Layer (Express)         │
│  - Routes                           │
│  - Middleware (validation, errors)  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Controller Layer              │
│  - Request/Response handling        │
│  - Input validation                 │
│  - HTTP status codes                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Service Layer                 │
│  - Business logic                   │
│  - Data processing                  │
│  - Cross-entity operations          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Model Layer (Mongoose)        │
│  - Data schemas                     │
│  - Validation rules                 │
│  - Database operations              │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Database (MongoDB)            │
│  - Data persistence                 │
│  - Indexes                          │
│  - Relationships                    │
└─────────────────────────────────────┘
```

## Directory Structure

```
workspace-booking-system/
│
├── src/
│   │
│   ├── config/
│   │   ├── database.js         # MongoDB connection setup
│   │   └── index.js            # Centralized configuration
│   │
│   ├── models/                 # Data Models (Mongoose Schemas)
│   │   ├── Space.js           # Space schema with all sub-schemas
│   │   ├── Booking.js         # Booking schema with validations
│   │   ├── Review.js          # Review schema with rating logic
│   │   └── User.js            # User schema
│   │
│   ├── services/              # Business Logic Layer
│   │   ├── spaceService.js   # Space-related operations
│   │   ├── bookingService.js # Booking operations & validations
│   │   └── reviewService.js  # Review management logic
│   │
│   ├── controllers/           # Request Handlers
│   │   ├── spaceController.js
│   │   ├── bookingController.js
│   │   └── reviewController.js
│   │
│   ├── routes/               # API Routes
│   │   ├── spaceRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── reviewRoutes.js
│   │   └── index.js          # Route aggregator
│   │
│   ├── middleware/           # Cross-cutting Concerns
│   │   ├── validation.js    # Input validation rules
│   │   ├── errorHandler.js  # Global error handling
│   │   └── rateLimiter.js   # API rate limiting
│   │
│   ├── utils/               # Utility Functions
│   │   ├── geoUtils.js     # Geolocation calculations
│   │   ├── dateUtils.js    # Date operations
│   │   └── priceCalculator.js # Pricing & GST logic
│   │
│   ├── app.js              # Express app configuration
│   └── server.js           # Server entry point
│
├── .env.example            # Environment template
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies & scripts
├── README.md              # Main documentation
├── API_EXAMPLES.md        # API usage examples
└── ARCHITECTURE.md        # This file
```

## Component Responsibilities

### Models Layer
**Purpose:** Define data structure and business rules at database level

**Responsibilities:**
- Schema definition with Mongoose
- Built-in validations (required, min, max, enum)
- Virtual fields and computed properties
- Pre/post hooks for data transformation
- Static methods for complex queries
- Instance methods for document operations
- Database indexes for performance

**Example:** Space.js
- Defines 15+ sub-schemas for complex data
- Automatic slug generation from name
- GST calculation in pre-save hook
- Multiple indexes for search optimization

### Services Layer
**Purpose:** Implement core business logic independent of HTTP concerns

**Responsibilities:**
- Complex business operations
- Data validation beyond schema rules
- Cross-entity operations
- Calculation logic
- Search and filtering
- Availability checking
- Statistics generation

**Example:** bookingService.js
- Validates booking overlaps
- Calculates refund amounts
- Manages booking lifecycle
- Generates booking statistics

### Controllers Layer
**Purpose:** Handle HTTP requests and responses

**Responsibilities:**
- Parse request parameters
- Call appropriate service methods
- Format responses
- Set HTTP status codes
- Handle validation errors

**Example:** spaceController.js
- Extracts query parameters
- Calls spaceService methods
- Returns JSON responses
- Handles success/error cases

### Routes Layer
**Purpose:** Define API endpoints and apply middleware

**Responsibilities:**
- Map URLs to controller methods
- Apply validation middleware
- Define HTTP methods (GET, POST, PUT, DELETE)
- Group related endpoints

**Example:** spaceRoutes.js
- Defines 11 space-related endpoints
- Applies validation to POST/PUT routes
- RESTful URL structure

### Middleware Layer
**Purpose:** Implement cross-cutting concerns

**Responsibilities:**
- Input validation with express-validator
- Error handling and formatting
- Rate limiting
- Security headers
- CORS configuration

### Utils Layer
**Purpose:** Provide reusable utility functions

**Responsibilities:**
- Geolocation distance calculation
- Date manipulation and validation
- Price and GST calculations
- Helper functions

## Data Flow

### Example: Create Booking

1. **Client Request**
   ```
   POST /api/bookings
   Body: { user, space, plan, dates, price }
   ```

2. **Route Layer**
   ```javascript
   router.post('/', bookingValidation.create, bookingController.createBooking)
   ```
   - Validation middleware checks input
   - Routes to controller

3. **Controller Layer**
   ```javascript
   bookingController.createBooking(req, res)
   ```
   - Extracts data from req.body
   - Calls service layer
   - Returns response

4. **Service Layer**
   ```javascript
   bookingService.createBooking(bookingData)
   ```
   - Validates space exists
   - Checks for date overlaps
   - Creates booking
   - Updates space analytics

5. **Model Layer**
   ```javascript
   new Booking(bookingData).save()
   ```
   - Validates against schema
   - Runs pre-save hooks
   - Persists to database

6. **Response**
   ```json
   {
     "success": true,
     "data": { booking object }
   }
   ```

## Key Design Patterns

### 1. Service Pattern
All business logic is in service classes, making it:
- Testable (no HTTP dependencies)
- Reusable (can be called from multiple controllers)
- Maintainable (single source of truth)

### 2. Repository Pattern (via Mongoose)
Database operations are abstracted through Mongoose models:
- Consistent query interface
- Built-in validation
- Easy to mock for testing

### 3. Middleware Pattern
Cross-cutting concerns are implemented as middleware:
- Validation
- Error handling
- Rate limiting
- Authentication (ready to add)

### 4. Factory Pattern (Mongoose Schemas)
Sub-schemas are defined and reused:
- imageSchema
- videoSchema
- addressSchema
- amenitySchema
- pricingPlanSchema

## Security Considerations

### Input Validation
- Schema-level validation (Mongoose)
- Route-level validation (express-validator)
- Type checking and sanitization

### Error Handling
- No sensitive data in error messages
- Consistent error format
- Stack traces only in development

### Rate Limiting
- General API: 100 requests/15 min
- Search: 30 requests/min
- Booking: 10 requests/hour

### Database Security
- No SQL injection (Mongoose parameterization)
- Indexed queries for performance
- Connection pooling

## Scalability Features

### Database Indexes
- Compound indexes for common queries
- Geospatial indexes for location search
- Text indexes ready to add

### Pagination
- All list endpoints support pagination
- Configurable page size
- Total count included

### Caching Ready
- Service layer responses can be cached
- Redis integration ready

### Microservices Ready
- Service layer can be extracted
- API versioning ready (/api/v1)
- Independent scaling possible

## Performance Optimization

### Database
- Strategic indexes on frequently queried fields
- Lean queries for read-only operations
- Projection to limit returned fields
- Aggregation pipelines for statistics

### API
- Compression middleware
- Response size limits
- Rate limiting
- Connection pooling

### Code
- Async/await throughout
- Error-first callbacks
- Proper error propagation
- Graceful shutdown handling

## Testing Strategy (Ready to Implement)

### Unit Tests
- Service layer functions
- Utility functions
- Model methods

### Integration Tests
- API endpoints
- Database operations
- Business workflows

### E2E Tests
- Complete user journeys
- Error scenarios
- Edge cases

## Monitoring & Logging (Ready to Add)

### Metrics to Track
- API response times
- Error rates
- Database query performance
- Booking conversion rates
- Search queries

### Logging Levels
- Error: System errors
- Warn: Business rule violations
- Info: Important events
- Debug: Detailed flow

## Future Enhancements

### Authentication & Authorization
- JWT token-based auth
- Role-based access control
- API key management

### Real-time Features
- WebSocket for availability updates
- Live booking notifications
- Chat support

### Advanced Search
- Elasticsearch integration
- Full-text search
- Faceted search

### File Upload
- Image upload to S3/Cloudinary
- Video upload
- Document management

### Analytics
- Advanced reporting
- Revenue tracking
- User behavior analytics
- A/B testing

### Integration
- Payment gateways (Stripe, Razorpay)
- Email services (SendGrid)
- SMS services (Twilio)
- Calendar sync (Google, Outlook)

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
NODE_ENV=production npm start
```

### Docker (Ready to Add)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

### Environment Variables
- `PORT` - Server port
- `MONGODB_URI` - Database connection
- `NODE_ENV` - Environment
- `CORS_ORIGIN` - Allowed origins

## Conclusion

This architecture provides:
- Clear separation of concerns
- Easy to test and maintain
- Scalable and performant
- Production-ready
- Ready for future enhancements

The layered approach ensures that changes in one layer don't affect others, making the system robust and adaptable to changing requirements.