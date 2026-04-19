# API Examples

This document provides comprehensive examples for testing all API endpoints.

## Prerequisites

Make sure the server is running:
```bash
npm start
```

Base URL: `http://localhost:3000`

## Spaces API

### 1. Create a Space

```bash
curl -X POST http://localhost:3000/api/spaces \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Hub Coworking Space",
    "shortDescription": "Modern coworking space with state-of-the-art facilities in the heart of Bangalore",
    "longDescription": "Tech Hub is a premium coworking space designed for startups, freelancers, and remote teams. We offer flexible workspace solutions with high-speed internet, meeting rooms, and a vibrant community atmosphere.",
    "tagline": "Work Smart, Work Together",
    "spaceType": "hot_desk",
    "capacity": {
      "min": 1,
      "max": 50
    },
    "totalArea": 5000,
    "floorNumber": 3,
    "access24x7": true,
    "operatingHours": [
      {
        "day": "monday",
        "isOpen": true,
        "openTime": "09:00",
        "closeTime": "20:00"
      },
      {
        "day": "tuesday",
        "isOpen": true,
        "openTime": "09:00",
        "closeTime": "20:00"
      }
    ],
    "highlights": [
      "High-speed WiFi 100 Mbps",
      "Free Coffee and Snacks",
      "Air Conditioned",
      "Printer and Scanner",
      "Gaming Zone"
    ],
    "houseRules": [
      "No smoking inside premises",
      "Maintain silence in work areas",
      "Clean your workspace after use"
    ],
    "accessibility": {
      "wheelchairAccessible": true,
      "elevatorAccess": true,
      "disabledParking": true,
      "accessibleRestrooms": true
    },
    "security": {
      "cctv": true,
      "securityGuard": true,
      "accessControl": true,
      "fireExtinguisher": true,
      "firstAidKit": true
    },
    "wifi": {
      "available": true,
      "speed": "100 Mbps",
      "isPaid": false
    },
    "powerBackup": true,
    "parking": {
      "available": true,
      "type": ["car", "bike"],
      "isPaid": true,
      "capacity": 30
    },
    "transport": {
      "nearestMetro": "MG Road Metro Station",
      "metroDistance": 0.5,
      "nearestBusStop": "Trinity Circle",
      "busDistance": 0.2
    },
    "address": {
      "street": "123 MG Road",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560001",
      "country": "India",
      "coordinates": {
        "latitude": 12.9716,
        "longitude": 77.5946
      },
      "nearbyLandmarks": ["MG Road Metro", "Trinity Circle", "Ulsoor Lake"],
      "timezone": "Asia/Kolkata"
    },
    "images": [
      {
        "url": "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
        "altText": "Main workspace area",
        "caption": "Spacious work area with natural lighting",
        "order": 1,
        "size": 2048000
      },
      {
        "url": "https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg",
        "altText": "Meeting room",
        "caption": "Private meeting room for 8 people",
        "order": 2,
        "size": 1024000
      }
    ],
    "videos": [
      {
        "url": "https://www.youtube.com/watch?v=example",
        "provider": "youtube",
        "thumbnail": "https://img.youtube.com/vi/example/maxresdefault.jpg",
        "duration": 120,
        "caption": "Virtual tour of Tech Hub"
      }
    ],
    "amenities": {
      "technology": [
        { "key": "wifi", "label": "High-Speed WiFi", "available": true, "description": "100 Mbps fiber connection" },
        { "key": "printer", "label": "Printer & Scanner", "available": true },
        { "key": "projector", "label": "Projector", "available": true }
      ],
      "workspaceFeatures": [
        { "key": "ac", "label": "Air Conditioning", "available": true },
        { "key": "ergonomic", "label": "Ergonomic Chairs", "available": true },
        { "key": "lockers", "label": "Personal Lockers", "available": true }
      ],
      "foodAndBeverages": [
        { "key": "coffee", "label": "Free Coffee", "available": true },
        { "key": "pantry", "label": "Pantry", "available": true },
        { "key": "cafeteria", "label": "Cafeteria", "available": true }
      ],
      "additionalServices": [
        { "key": "reception", "label": "Reception Services", "available": true },
        { "key": "mail", "label": "Mail Handling", "available": true },
        { "key": "cleaning", "label": "Daily Cleaning", "available": true }
      ]
    },
    "pricingPlans": [
      {
        "type": "hourly",
        "price": 100,
        "currency": "INR",
        "gstPercentage": 18,
        "inclusions": ["WiFi", "Coffee"],
        "refundable": false,
        "isActive": true,
        "minSeats": 1,
        "maxSeats": 5
      },
      {
        "type": "daily",
        "price": 500,
        "currency": "INR",
        "gstPercentage": 18,
        "inclusions": ["WiFi", "Coffee", "Parking"],
        "refundable": true,
        "deposit": 500,
        "isActive": true,
        "minSeats": 1,
        "maxSeats": 10
      },
      {
        "type": "monthly",
        "price": 8000,
        "currency": "INR",
        "gstPercentage": 18,
        "inclusions": ["WiFi", "Coffee", "Parking", "Meeting Room 2hrs/day"],
        "refundable": true,
        "deposit": 5000,
        "isActive": true,
        "minSeats": 1,
        "maxSeats": 20
      }
    ],
    "resources": [
      {
        "name": "Conference Room A",
        "type": "meeting_room",
        "capacity": {
          "min": 4,
          "max": 10
        },
        "area": 300,
        "amenities": [
          { "key": "projector", "label": "Projector", "available": true },
          { "key": "whiteboard", "label": "Whiteboard", "available": true }
        ],
        "images": [
          {
            "url": "https://images.pexels.com/photos/416320/pexels-photo-416320.jpeg",
            "altText": "Conference Room A"
          }
        ],
        "pricingRules": [
          {
            "type": "hourly",
            "price": 500,
            "currency": "INR",
            "gstPercentage": 18,
            "isActive": true
          }
        ]
      }
    ],
    "contact": {
      "phone": "+91 9876543210",
      "email": "info@techhub.com",
      "whatsapp": "+91 9876543210",
      "managerName": "Rajesh Kumar",
      "managerPhone": "+91 9876543211",
      "managerEmail": "rajesh@techhub.com"
    },
    "billing": {
      "gstNumber": "29ABCDE1234F1Z5",
      "paymentMethods": ["cash", "card", "upi", "netbanking"]
    },
    "tags": ["coworking", "startups", "freelancers", "24x7"],
    "categories": ["Coworking Space", "Hot Desk"],
    "isPublished": true,
    "isFeatured": true
  }'
```

### 2. Search Spaces

```bash
# Basic search by city
curl "http://localhost:3000/api/spaces/search?city=Bangalore"

# Search with multiple filters
curl "http://localhost:3000/api/spaces/search?city=Bangalore&spaceType=hot_desk&minPrice=300&maxPrice=1000&rating=4&page=1&limit=10"

# Location-based search (within 5km radius)
curl "http://localhost:3000/api/spaces/search?latitude=12.9716&longitude=77.5946&radius=5"

# Search by capacity
curl "http://localhost:3000/api/spaces/search?minCapacity=10&maxCapacity=50"
```

### 3. Get Space by Slug

```bash
curl "http://localhost:3000/api/spaces/slug/tech-hub-coworking-space"
```

### 4. Get Featured Spaces

```bash
curl "http://localhost:3000/api/spaces/featured?limit=5"
```

### 5. Get Nearby Spaces

```bash
curl "http://localhost:3000/api/spaces/nearby?latitude=12.9716&longitude=77.5946&radius=5&limit=10"
```

### 6. Check Availability

```bash
curl "http://localhost:3000/api/spaces/SPACE_ID/availability?startDate=2024-01-01&endDate=2024-01-05"
```

### 7. Update Space

```bash
curl -X PUT http://localhost:3000/api/spaces/SPACE_ID \
  -H "Content-Type: application/json" \
  -d '{
    "shortDescription": "Updated description",
    "isFeatured": true
  }'
```

## Bookings API

### 1. Create Booking

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+91 9876543210"
    },
    "space": "SPACE_ID",
    "plan": {
      "planId": "PLAN_ID",
      "type": "daily"
    },
    "bookingDuration": {
      "startDate": "2024-02-01",
      "endDate": "2024-02-05",
      "startTime": "09:00",
      "endTime": "18:00"
    },
    "quantity": {
      "seats": 2,
      "units": 4
    },
    "priceBreakdown": {
      "basePrice": 2000,
      "gstPercentage": 18,
      "gstAmount": 360,
      "deposit": 500,
      "discount": 0,
      "totalAmount": 2860
    },
    "specialRequests": "Need corner seats with extra monitors"
  }'
```

### 2. Get User Bookings

```bash
# All bookings
curl "http://localhost:3000/api/bookings/user/USER_ID"

# Upcoming bookings
curl "http://localhost:3000/api/bookings/user/USER_ID?upcoming=true"

# Past bookings
curl "http://localhost:3000/api/bookings/user/USER_ID?past=true"

# Filter by status
curl "http://localhost:3000/api/bookings/user/USER_ID?status=confirmed"
```

### 3. Get Space Bookings

```bash
curl "http://localhost:3000/api/bookings/space/SPACE_ID?startDate=2024-01-01&endDate=2024-12-31"
```

### 4. Update Payment Status

```bash
curl -X PUT http://localhost:3000/api/bookings/BOOKING_ID/payment \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paid",
    "method": "upi",
    "transactionId": "TXN1234567890"
  }'
```

### 5. Confirm Booking

```bash
curl -X PUT http://localhost:3000/api/bookings/BOOKING_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed",
    "notes": "Payment verified and booking confirmed"
  }'
```

### 6. Cancel Booking

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/cancel \
  -H "Content-Type: application/json" \
  -d '{
    "cancelledBy": "user",
    "reason": "Change of plans"
  }'
```

### 7. Check In

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/check-in
```

### 8. Check Out

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/check-out
```

### 9. Get Booking Statistics

```bash
curl "http://localhost:3000/api/bookings/space/SPACE_ID/stats?startDate=2024-01-01&endDate=2024-12-31"
```

## Reviews API

### 1. Create Review

```bash
curl -X POST http://localhost:3000/api/reviews \
  -H "Content-Type: application/json" \
  -d '{
    "space": "SPACE_ID",
    "user": {
      "name": "Sarah Johnson",
      "avatar": "https://i.pravatar.cc/150?img=1"
    },
    "booking": "BOOKING_ID",
    "rating": 5,
    "reviewText": "Absolutely loved the workspace! The amenities were top-notch, and the staff was very helpful. The internet speed was exactly as advertised, and the coffee was great. Highly recommended for anyone looking for a productive environment.",
    "ratings": {
      "cleanliness": 5,
      "amenities": 5,
      "location": 4,
      "valueForMoney": 5,
      "staff": 5
    },
    "images": [
      "https://images.pexels.com/photos/desk-setup.jpg"
    ]
  }'
```

### 2. Get Space Reviews

```bash
# All reviews
curl "http://localhost:3000/api/reviews/space/SPACE_ID"

# Filter by rating
curl "http://localhost:3000/api/reviews/space/SPACE_ID?rating=5"

# Verified reviews only
curl "http://localhost:3000/api/reviews/space/SPACE_ID?verifiedOnly=true"

# Sort by helpful count
curl "http://localhost:3000/api/reviews/space/SPACE_ID?sortBy=helpful.count"
```

### 3. Get User Reviews

```bash
curl "http://localhost:3000/api/reviews/user/USER_ID"
```

### 4. Update Review

```bash
curl -X PUT http://localhost:3000/api/reviews/REVIEW_ID \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "rating": 4,
    "reviewText": "Updated review text"
  }'
```

### 5. Add Response to Review

```bash
curl -X POST http://localhost:3000/api/reviews/REVIEW_ID/response \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Thank you so much for your wonderful feedback! We are glad you enjoyed your experience at Tech Hub.",
    "respondedBy": "Rajesh Kumar - Manager"
  }'
```

### 6. Mark Review as Helpful

```bash
curl -X POST http://localhost:3000/api/reviews/REVIEW_ID/helpful \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID"
  }'
```

### 7. Flag Review

```bash
curl -X POST http://localhost:3000/api/reviews/REVIEW_ID/flag \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Contains inappropriate language"
  }'
```

### 8. Delete Review

```bash
curl -X DELETE http://localhost:3000/api/reviews/REVIEW_ID \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID"
  }'
```

## Complete Workflow Example

### Scenario: User searches, books, and reviews a workspace

```bash
# Step 1: Search for spaces in Bangalore
curl "http://localhost:3000/api/spaces/search?city=Bangalore&spaceType=hot_desk"

# Step 2: Get detailed information about a space
curl "http://localhost:3000/api/spaces/SPACE_ID"

# Step 3: Check availability
curl "http://localhost:3000/api/spaces/SPACE_ID/availability?startDate=2024-02-01&endDate=2024-02-05"

# Step 4: Create a booking
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{...booking data...}'

# Step 5: Update payment status
curl -X PUT http://localhost:3000/api/bookings/BOOKING_ID/payment \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paid",
    "method": "upi",
    "transactionId": "TXN123"
  }'

# Step 6: Confirm booking
curl -X PUT http://localhost:3000/api/bookings/BOOKING_ID/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed"
  }'

# Step 7: Check in on booking day
curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/check-in

# Step 8: Check out
curl -X POST http://localhost:3000/api/bookings/BOOKING_ID/check-out

# Step 9: Leave a review
curl -X POST http://localhost:3000/api/reviews \
  -H "Content-Type: application/json" \
  -d '{...review data...}'
```

## Testing Tips

1. Replace `SPACE_ID`, `BOOKING_ID`, `USER_ID`, `PLAN_ID`, and `REVIEW_ID` with actual IDs from your database
2. Use tools like Postman or Insomnia for easier testing
3. Check the response status codes and messages
4. Monitor MongoDB to see the data being created
5. Test error cases by providing invalid data

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": {...}
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "details": [...]
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "spaces": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "pages": 5
    }
  }
}