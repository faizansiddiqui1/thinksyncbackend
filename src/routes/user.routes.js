import express from 'express';
import * as userController from '../controllers/user_controllers/user.controller.js';
import { requireMinRole } from '../middlewares/rbac.js';
import { loadUserProfile, requireAuth } from '../middlewares/auth.js';

const router = express.Router();



router.get("/user-profile", requireAuth, loadUserProfile, userController.getUserProfileHandler);

router.post("/verify/send-otp", requireAuth, userController.sendProfileOtpHandler);

router.post("/verify/confirm-otp", requireAuth, userController.confirmProfileOtpHandler);

router.put("/profile", requireAuth, userController.updateProfileHandler);

router.put("/profile/password", requireAuth, userController.changePasswordHandler);






// not working
router.get('/', requireMinRole('admin'), userController.getAllUsers);

router.get('/:id', requireMinRole('admin'), userController.getUserById);

router.patch('/:id/deactivate', requireMinRole('admin'), userController.deactivateUser);

router.patch('/:id/activate', requireMinRole('admin'), userController.activateUser);

export default router;
