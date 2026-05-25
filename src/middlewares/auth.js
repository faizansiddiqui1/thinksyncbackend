// @ts-nocheck

import jwt from "jsonwebtoken";
import User from "../models/user_models/User.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";
import Role from "../models/super_admin_models/Role.js"; // adjust path

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
      return res.status(401).json({ message: "Auth required" });

    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.userId).select(
      "_id email role isActive customRoles phoneNumber username",
    );
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ message: "Invalid token or user disabled" });

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.userId).select(
      "_id email role isActive",
    );
    if (user && user.isActive) req.user = user;
    return next();
  } catch (err) {
    return next();
  }
};

export const requireAdminApproved = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ message: "Admin role required" });
    }

    const adminProfile = await AdminProfile.findOne({
      owner: req.user._id,
    }).lean();

    if (!adminProfile) {
      return res.status(403).json({ message: "Admin profile not found" });
    }

    if (adminProfile.kyc?.status !== "approved") {
      return res.status(403).json({ message: "Admin KYC not approved" });
    }

    return next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

// Load admin Profile
export const loadAdminProfile = async (req, res, next) => {
  try {
    const profile = await AdminProfile.findOne({ owner: req.user._id });

    // Owner-level admin → profile required
    if (req.user.role === "admin" && !profile) {
      return res.status(403).json({ message: "Admin profile not found" });
    }

    // Manager-level users → profile optional
    req.adminProfile = profile || null;

    next();
  } catch (err) {
    console.error("loadAdminProfile error:", err);
    return res.status(500).json({ message: "Error loading admin profile" });
  }
};


export const loadUserProfile = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await User.findById(req.user._id).select(
      "_id email username phoneNumber role phoneVerified emailVerified kyc isActive createdAt updatedAt"
    );

    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    // attach to req
    req.userProfile = profile;

    next();
  } catch (err) {
    console.error("loadUserProfile error:", err);
    return res.status(500).json({ message: "Error loading user profile" });
  }
};


export const requireAdminAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Super Admin → FULL ACCESS (no KYC)
    if (req.user.role === "super_admin") {
      return next();
    }

    // ✅ Normal Admin → KYC required
    if (req.user.role === "admin") {
      const profile = await AdminProfile.findOne({ owner: req.user._id });

      if (!profile || profile.kyc?.status !== "approved") {
        return res.status(403).json({ message: "Admin KYC not approved" });
      }

      req.adminProfile = profile;
      return next();
    }

    // ✅ RBAC users
    if (req.user.customRoles?.length > 0) {
      return next();
    }

    return res.status(403).json({ message: "Admin panel access denied" });

  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

export const requirePermission =
  (resource, action) => async (req, res, next) => {
    try {
      const user = req.user;

      // Super admin ko full access (bypass)
      if (user.role === "admin" || user.role === "super_admin") {
        return next();
      }

      // Custom roles se check
      let hasPermission = false;

      // Agar customRoles nahi hai ya array nahi → direct deny
      if (!user.customRoles || !Array.isArray(user.customRoles)) {
        return res.status(403).json({ message: "No custom roles assigned" });
      }

      for (const roleId of user.customRoles) {
        const role = await Role.findById(roleId);
        if (role && role.hasPermission(resource, action)) {
          hasPermission = true;
          break;
        }
      }

      if (!hasPermission) {
        return res.status(403).json({
          message: `Permission denied: ${resource} - ${action}`,
        });
      }

      next();
    } catch (err) {
      console.error("Permission middleware error:", err);
      return res.status(500).json({ message: "Permission check failed" });
    }
  };
