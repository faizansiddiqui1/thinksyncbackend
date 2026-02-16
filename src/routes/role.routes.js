import express from 'express';
import * as roleController from '../controllers/super_admin_controllers/role.controller.js';

import { requireAdminApproved, requireAuth } from '../middlewares/auth.js';

const router = express.Router();



router.post('/role-create', requireAuth, requireAdminApproved, roleController.createRole);

router.get('/', requireAuth, requireAdminApproved, roleController.getAllRoles);

router.put('/:id', requireAuth, requireAdminApproved, roleController.updateRole);

router.delete('/:id', requireAuth, requireAdminApproved, roleController.deleteRole);

router.post('/assign', requireAuth, requireAdminApproved, roleController.assignRole);

router.get('/:id', requireAuth, requireAdminApproved, roleController.getRoleById);

export default router;
