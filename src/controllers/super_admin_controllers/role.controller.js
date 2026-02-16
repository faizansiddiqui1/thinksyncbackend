import * as roleService from '../../services/role.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export const createRole = async (req, res, next) => {
  try {
    const role = await roleService.createRole(req.body, req.user._id);

    res.status(201).json(
      new ApiResponse(201, { role }, 'Role created successfully')
    );
  } catch (error) {
    next(error);
  }
};

export const getAllRoles = async (req, res, next) => {
  try {
    const roles = await roleService.getAllRoles();

    res.status(200).json(
      new ApiResponse(200, { roles }, 'Roles fetched successfully')
    );
  } catch (error) {
    next(error);
  }
};

export const getRoleById = async (req, res, next) => {
  try {
    const role = await roleService.getRoleById(req.params.id);

    res.status(200).json(
      new ApiResponse(200, { role }, 'Role fetched successfully')
    );
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const role = await roleService.updateRole(req.params.id, req.body);

    res.status(200).json(
      new ApiResponse(200, { role }, 'Role updated successfully')
    );
  } catch (error) {
    next(error);
  }
};

export const deleteRole = async (req, res, next) => {
  try {
    await roleService.deleteRole(req.params.id);

    res.status(200).json(
      new ApiResponse(200, null, 'Role deleted successfully')
    );
  } catch (error) {
    next(error);
  }
};

export const assignRole = async (req, res, next) => {
  try {
    const { identifier, role } = req.body;

    const user = await roleService.assignRoleToUser(identifier, role);

    res.status(200).json(
      new ApiResponse(200, { user }, 'Role assigned successfully')
    );
  } catch (error) {
    next(error);
  }
};
