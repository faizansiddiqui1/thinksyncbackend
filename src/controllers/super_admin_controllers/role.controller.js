import Role from "../../models/super_admin_models/Role.js";
import User from "../../models/user_models/User.js";
import * as roleService from "../../services/role.service.js";
import { ApiResponse } from "../../utils/apiResponse.js";

export const createRole = async (req, res, next) => {
  try {
    const role = await roleService.createRole(req.body, req.user._id);

    res
      .status(201)
      .json(new ApiResponse(201, { role }, "Role created successfully"));
  } catch (error) {
    next(error);
  }
};

// controllers/super_admin_controllers/role.controller.js
export const getAllRoles = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    const roles = await roleService.getAllRoles(userId, userRole);

    res
      .status(200)
      .json(new ApiResponse(200, { roles }, "Roles fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const getRoleById = async (req, res, next) => {
  try {
    const role = await roleService.getRoleById(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, { role }, "Role fetched successfully"));
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const role = await roleService.updateRole(req.params.id, req.body);

    res
      .status(200)
      .json(new ApiResponse(200, { role }, "Role updated successfully"));
  } catch (error) {
    next(error);
  }
};

export const deleteRole = async (req, res, next) => {
  try {
    await roleService.deleteRole(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, null, "Role deleted successfully"));
  } catch (error) {
    next(error);
  }
};

export const assignRole = async (req, res, next) => {
  try {
    const { identifier, role } = req.body;

    if (!identifier || !role) {
      throw new ApiError(400, "identifier and role are required");
    }

    const user = await roleService.assignRoleToUser(identifier, role);

    res
      .status(200)
      .json(new ApiResponse(200, { user }, "Role assigned successfully"));
  } catch (error) {
    next(error);
  }
};

// Get Assigned roll
export const getAssignedRoles = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const usersWithMyRoles = await User.find({
      $or: [
        { role: { $in: ['manager'] }, createdBy: currentUserId }, // agar primary role bhi track karna ho
        { customRoles: { $in: await Role.find({ createdBy: currentUserId }).distinct('_id') } }
      ]
    })
    .select('email username role customRoles')
    .populate({
      path: 'customRoles',
      match: { createdBy: currentUserId },
      select: 'name displayName permissions'
    })
    .lean();

    res.json({
      success: true,
      assigned: usersWithMyRoles
    });
  } catch (err) {
    next(err);
  }
};

// Remove asigned roll
export const removeRoleFromUser = async (req, res, next) => {
  try {
    const { userId, roleName } = req.body;
    const currentUserId = req.user._id;

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    const role = await Role.findOne({ name: roleName.toLowerCase(), createdBy: currentUserId });
    if (!role) throw new ApiError(403, 'Role not found or not created by you');

    // Custom role remove
    user.customRoles = user.customRoles.filter(id => !id.equals(role._id));

    // Agar primary role tha aur tumne banaya to reset (optional)
    // if (user.role === roleName) user.role = 'user';

    await user.save();

    res.json({ success: true, message: 'Role removed' });
  } catch (err) {
    next(err);
  }
};