import { Router } from 'express';
import {
  getRestaurantMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability,
} from './menu.controller.js';

const router = Router();

router.get('/:restaurantId', getRestaurantMenu);
router.post('/category', createCategory);
router.put('/category/:id', updateCategory);
router.delete('/category/:id', deleteCategory);

router.post('/item', createMenuItem);
router.put('/item/:id', updateMenuItem);
router.patch('/item/:id/availability', toggleItemAvailability);
router.delete('/item/:id', deleteMenuItem);

export { router as menuRouter };
