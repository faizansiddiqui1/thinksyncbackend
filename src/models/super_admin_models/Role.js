import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      trim: true
    },
    actions: [{
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'manage'],
      required: true
    }]
  }],
  isSystem: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});


roleSchema.methods.hasPermission = function(resource, action) {
  const permission = this.permissions.find(p => p.resource === resource);
  if (!permission) return false;
  return permission.actions.includes(action) || permission.actions.includes('manage');
};

const Role = mongoose.model('Role', roleSchema);

export default Role;
