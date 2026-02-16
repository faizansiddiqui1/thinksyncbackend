import express from 'express';
import * as userController from '../controllers/user_controllers/user.controller.js';
import { requireMinRole } from '../middlewares/rbac.js';

const router = express.Router();


router.get('/profile', userController.getProfile);

router.put('/profile', userController.updateProfile);

router.post('/change-password', userController.changePassword);

router.get('/', requireMinRole('admin'), userController.getAllUsers);

router.get('/:id', requireMinRole('admin'), userController.getUserById);

router.patch('/:id/deactivate', requireMinRole('admin'), userController.deactivateUser);

router.patch('/:id/activate', requireMinRole('admin'), userController.activateUser);

export default router;
