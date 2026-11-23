import { Router } from 'express';
import {
  getRestaurants,
  getRestaurantBySlug,
  getRestaurantById,
  createRestaurant,
  updateRestaurant,
  getRestaurantTables,
  createRestaurantTable,
} from './restaurant.controller.js';
import { validateBody } from '../../middleware/ValidateRequest.js';
import { requireAuth, requireRole, requireRestaurantAccess } from '../../middleware/Auth.js';
import { CreateRestaurantSchema } from '../../../validators/index.js';

const router = Router();

router.get('/', getRestaurants);
router.get('/slug/:slug', getRestaurantBySlug);
router.get('/:id', getRestaurantById);
router.post(
  '/',
  requireAuth,
  requireRole('RESTAURANT_OWNER', 'SUPER_ADMIN'),
  validateBody(CreateRestaurantSchema),
  createRestaurant
);
router.put('/:id', requireAuth, requireRestaurantAccess, updateRestaurant);
router.get('/:id/tables', getRestaurantTables);
router.post('/:id/tables', requireAuth, requireRestaurantAccess, createRestaurantTable);

export { router as restaurantRouter };
