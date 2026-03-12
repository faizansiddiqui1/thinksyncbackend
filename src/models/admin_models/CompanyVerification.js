import mongoose from 'mongoose';

const docStatus = {
  type: String,
  enum: ['pending', 'verified', 'rejected'],
  default: 'pending'
};

const subSchema = new mongoose.Schema({
  status: docStatus,
  data: { type: Object }
}, { _id: false });


const bankSchema = new mongoose.Schema({
  status: docStatus,
  account: String,
  ifsc: String,
  data: { type: Object }
}, { _id: false });

const aadhaarSchema = new mongoose.Schema({
  status: docStatus,
  uid: String,        // 👈 add this
  data: { type: Object }
}, { _id: false });

const CompanyVerificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  aadhaar: aadhaarSchema,
  pan: subSchema,
  bank: bankSchema,
  companyPan: subSchema,
  cin: subSchema,
  gst: subSchema,
  companyBank: subSchema
}, { timestamps: true });

export default mongoose.model('CompanyVerification', CompanyVerificationSchema);
