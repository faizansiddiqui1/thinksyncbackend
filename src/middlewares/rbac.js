import { ApiError } from '../utils/apiResponse.js';

const roleHierarchy = {
  user: 1,
  manager: 2,
  admin: 3,
  super_admin: 4
};


export const requireMinRole = (minRole) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required. Please login to continue');
      }

      const userRoleLevel = roleHierarchy[req.user.role] || 0;
      const minRoleLevel = roleHierarchy[minRole] || 0;

      if (userRoleLevel < minRoleLevel) {
        throw new ApiError(403, 'You do not have permission to access this resource');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requirePermission = (resource, action) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Authentication required. Please login to continue');
      }

      if (req.user.role === 'super_admin') {
        return next();
      }

      const hasPermission = req.user.customRoles?.some(role =>
        role.hasPermission(resource, action)
      );

      if (!hasPermission) {
        throw new ApiError(403, 'You do not have permission to perform this action');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const isSuperAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required. Please login to continue');
    }

    if (req.user.role !== 'super_admin') {
      throw new ApiError(403, 'This action requires super admin privileges');
    }

    next();
  } catch (error) {
    next(error);
  }
};
