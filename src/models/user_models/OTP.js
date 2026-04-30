import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  otp: {
    type: String,
    required: [true, 'OTP is required']
  },
  purpose: {
    type: String,
    enum: ['login', 'registration', 'password_reset', 'verification'],
    default: 'login'
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  verified: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }
  }
}, {
  timestamps: true
});

otpSchema.index({ phoneNumber: 1, verified: 1 });
otpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

otpSchema.methods.isExpired = function() {
  return Date.now() > this.expiresAt;
};

otpSchema.methods.canRetry = function() {
  return this.attempts < this.maxAttempts;
};

const OTP = mongoose.model('OTP', otpSchema);

export default OTP;
