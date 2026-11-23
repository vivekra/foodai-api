import { Router } from 'express';
import {
  getStats,
  getAdminRestaurants,
  verifyRestaurant,
  getPricing,
  updatePricing,
  getUsers,
  updateUserRole,
} from './admin.controller.js';
import { validateBody } from '../../middleware/ValidateRequest.js';
import { requireSuperAdmin } from '../../middleware/Auth.js';
import { UpdatePricingSchema } from '../../../validators/index.js';

const router = Router();

// Strictly enforce Super Admin authentication across all admin endpoints
router.use(requireSuperAdmin);

router.get('/stats', getStats);
router.get('/restaurants', getAdminRestaurants);
router.patch('/restaurants/:id/verify', verifyRestaurant);
router.get('/pricing', getPricing);
router.put('/pricing', validateBody(UpdatePricingSchema), updatePricing);
router.get('/users', getUsers);
router.patch('/users/:id/role', updateUserRole);

export { router as adminRouter };
