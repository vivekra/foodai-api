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
import { CreateRestaurantSchema } from '../../../validators/index.js';

const router = Router();

router.get('/', getRestaurants);
router.get('/slug/:slug', getRestaurantBySlug);
router.get('/:id', getRestaurantById);
router.post('/', validateBody(CreateRestaurantSchema), createRestaurant);
router.put('/:id', updateRestaurant);
router.get('/:id/tables', getRestaurantTables);
router.post('/:id/tables', createRestaurantTable);

export { router as restaurantRouter };
