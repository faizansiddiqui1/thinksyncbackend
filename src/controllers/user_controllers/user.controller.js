import User from "../../models/user_models/User.js";
import { ApiResponse, ApiError } from "../../utils/apiResponse.js";
import {
  sendProfileOtp,
  confirmProfileOtp,
} from "../../services/profile.service.js";

// controllers/user.controller.js
import {
  updateUserProfile,
  changeUserPassword,
} from "../../services/user.service.js";

export const getUserProfileHandler = async (req, res) => {
  try {
    // loadUserProfile middleware se already attach ho chuka hoga
    if (!req.userProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    return res.status(200).json({
      success: true,
      data: req.userProfile,
    });
  } catch (err) {
    console.error("getUserProfile error:", err);
    return res.status(500).json({ message: "Failed to fetch user profile" });
  }
};

export const sendProfileOtpHandler = async (req, res) => {
  try {
    const identifier = req.body.identifier;
    if (!identifier)
      return res.status(400).json({ message: "Identifier required" });
    await sendProfileOtp(req.user._id, identifier);
    return res.json({ success: true, message: "OTP sent" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const confirmProfileOtpHandler = async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ message: "Identifier and OTP required" });
    await confirmProfileOtp(req.user._id, identifier, otp);
    return res.json({ success: true, message: "Verified successfully" });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const updateProfileHandler = async (req, res) => {
  try {
    const userId = req.user._id;
    const updates = req.body || {};

    const result = await updateUserProfile(userId, updates);

    // If pending (identifier change) -> 202 Accepted with message
    if (result && result.pending) {
      return res.status(202).json({ success: true, message: result.message });
    }

    // return updated user (sanitized)
    return res.json({
      success: true,
      message: result.message,
      data: result.user,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const changePasswordHandler = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;
    const result = await changeUserPassword(
      userId,
      currentPassword,
      newPassword,
    );
    return res.json({ success: true, message: result.message });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};










export const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;

    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("-password -refreshTokens")
      .populate("customRoles")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const count = await User.countDocuments(query);

    res.status(200).json(
      new ApiResponse(
        200,
        {
          users,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          totalUsers: count,
        },
        "Users fetched successfully",
      ),
    );
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -refreshTokens")
      .populate("customRoles");

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res
      .status(200)
      .json(new ApiResponse(200, { user }, "User fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    ).select("-password -refreshTokens");

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res
      .status(200)
      .json(new ApiResponse(200, { user }, "User deactivated successfully"));
  } catch (error) {
    next(error);
  }
};

export const activateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true },
    ).select("-password -refreshTokens");

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res
      .status(200)
      .json(new ApiResponse(200, { user }, "User activated successfully"));
  } catch (error) {
    next(error);
  }
};
