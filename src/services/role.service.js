import Role from '../models/super_admin_models/Role.js';
import User from '../models/user_models/User.js';
import { ApiError } from '../utils/apiResponse.js';

export const createRole = async (roleData, createdBy) => {
  const { name, displayName, description, permissions } = roleData;

  const existingRole = await Role.findOne({ name: name.toLowerCase() });
  if (existingRole) {
    throw new ApiError(409, 'A role with this name already exists');
  }

  const role = await Role.create({
    name: name.toLowerCase(),
    displayName,
    description,
    permissions: permissions || [],
    createdBy
  });

  return role;
};

export const getAllRoles = async () => {
  const roles = await Role.find({ isActive: true })
    .populate('createdBy', 'email username')
    .sort({ createdAt: -1 });

  return roles;
};

export const getRoleById = async (roleId) => {
  const role = await Role.findById(roleId)
    .populate('createdBy', 'email username');

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  return role;
};

export const updateRole = async (roleId, updateData) => {
  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  if (role.isSystem) {
    throw new ApiError(403, 'System roles cannot be modified');
  }

  Object.assign(role, updateData);
  await role.save();

  return role;
};

export const deleteRole = async (roleId) => {
  const role = await Role.findById(roleId);

  if (!role) {
    throw new ApiError(404, 'Role not found');
  }

  if (role.isSystem) {
    throw new ApiError(403, 'System roles cannot be deleted');
  }

  const usersWithRole = await User.countDocuments({
    customRoles: roleId
  });

  if (usersWithRole > 0) {
    throw new ApiError(400, `Cannot delete role. ${usersWithRole} user(s) are assigned this role`);
  }

  await Role.findByIdAndDelete(roleId);

  return { message: 'Role deleted successfully' };
};

export const assignRoleToUser = async (identifier, roleName) => {
  const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier.toLowerCase() }
    ]
  });

  if (!user) {
    throw new ApiError(404, 'No account found with this email or username');
  }

  const validRoles = ['user', 'manager', 'admin', 'super_admin'];
  if (!validRoles.includes(roleName)) {
    const customRole = await Role.findOne({ name: roleName.toLowerCase() });
    if (!customRole) {
      throw new ApiError(404, 'Role not found');
    }

    if (!user.customRoles.includes(customRole._id)) {
      user.customRoles.push(customRole._id);
    }
  } else {
    user.role = roleName;
  }

  await user.save();

  return user;
};

export const removeRoleFromUser = async (userId, roleId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.customRoles = user.customRoles.filter(
    role => role.toString() !== roleId.toString()
  );

  await user.save();

  return user;
};
