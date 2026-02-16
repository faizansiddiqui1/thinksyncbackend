import 'dotenv/config';

const config = {
  port: process.env.PORT || 3000,

  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/workspace-booking',

  nodeEnv: process.env.NODE_ENV || 'development',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  pagination: {
    defaultLimit: 20,
    maxLimit: 100
  },

  booking: {
    cancellationRefundHours: {
      full: 24,
      half: 12,
      quarter: 6
    }
  },

  search: {
    defaultRadius: 10,
    maxRadius: 100
  },

  gst: {
    defaultPercentage: 18
  }
};

export default config;
