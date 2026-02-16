// middlewares/auth.js
import jwt from "jsonwebtoken";
import User from "../models/user_models/User.js";
import AdminProfile from "../models/admin_models/AdminProfile.js";

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
      return res.status(401).json({ message: "Auth required" });

    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(payload.userId).select(
      "_id email role isActive",
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

    // if (adminProfile.kyc?.status !== "approved") {
    //   return res.status(403).json({ message: "Admin KYC not approved" });
    // }

    return next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

