import { body } from 'express-validator';

export const spaceValidation = {
  create: [
    body('name')
      .notEmpty()
      .trim()
      .withMessage('Space name is required'),

    body('shortDescription')
      .notEmpty()
      .isLength({ max: 200 })
      .withMessage(
        'Short description is required and must be under 200 characters'
      ),

    body('longDescription')
      .notEmpty()
      .withMessage('Long description is required'),

    body('spaceType')
      .isIn([
        'private_office',
        'hot_desk',
        'meeting_room',
        'dedicated_desk',
        'virtual_office',
        'event_space'
      ])
      .withMessage('Invalid space type'),

    body('capacity.min')
      .isInt({ min: 1 })
      .withMessage('Minimum capacity must be at least 1'),

    body('capacity.max')
      .isInt({ min: 1 })
      .withMessage('Maximum capacity must be at least 1'),

    body('totalArea')
      .isNumeric()
      .withMessage('Total area is required'),

    body('floorNumber')
      .isInt()
      .withMessage('Floor number is required'),

    body('address.street')
      .notEmpty()
      .withMessage('Street address is required'),

    body('address.city')
      .notEmpty()
      .withMessage('City is required'),

    body('address.state')
      .notEmpty()
      .withMessage('State is required'),

    body('address.pincode')
      .notEmpty()
      .withMessage('Pincode is required'),

    body('address.coordinates.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),

    body('address.coordinates.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),

    body('contact.phone')
      .notEmpty()
      .withMessage('Contact phone is required'),

    body('contact.email')
      .isEmail()
      .withMessage('Valid contact email is required')
  ]
};

export const bookingValidation = {
  create: [
    body('user.name')
      .notEmpty()
      .trim()
      .withMessage('User name is required'),

    body('user.email')
      .isEmail()
      .withMessage('Valid email is required'),

    body('user.phone')
      .notEmpty()
      .withMessage('Phone number is required'),

    body('space')
      .notEmpty()
      .withMessage('Space ID is required'),

    body('plan.planId')
      .notEmpty()
      .withMessage('Plan ID is required'),

    body('plan.type')
      .isIn(['hourly', 'daily', 'monthly', 'yearly'])
      .withMessage('Invalid plan type'),

    body('bookingDuration.startDate')
      .isISO8601()
      .withMessage('Valid start date is required'),

    body('bookingDuration.endDate')
      .isISO8601()
      .withMessage('Valid end date is required'),

    body('priceBreakdown.basePrice')
      .isNumeric({ min: 0 })
      .withMessage('Base price is required'),

    body('priceBreakdown.gstAmount')
      .isNumeric({ min: 0 })
      .withMessage('GST amount is required'),

    body('priceBreakdown.totalAmount')
      .isNumeric({ min: 0 })
      .withMessage('Total amount is required')
  ]
};

export const reviewValidation = {
  create: [
    body('bookingId')
      .notEmpty()
      .withMessage('Booking ID is required'),

    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),

    body('comment')
      .notEmpty()
      .isLength({ min: 10, max: 1000 })
      .withMessage(
        'Review comment must be between 10 and 1000 characters'
      )
  ]
};
