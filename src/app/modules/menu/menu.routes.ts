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
router.get('/restaurant/:restaurantId', getRestaurantMenu);

router.post('/category', createCategory);
router.post('/categories', createCategory);
router.put('/category/:id', updateCategory);
router.put('/categories/:id', updateCategory);
router.delete('/category/:id', deleteCategory);
router.delete('/categories/:id', deleteCategory);

router.post('/item', createMenuItem);
router.post('/items', createMenuItem);
router.put('/item/:id', updateMenuItem);
router.put('/items/:id', updateMenuItem);
router.patch('/item/:id/availability', toggleItemAvailability);
router.patch('/items/:id/availability', toggleItemAvailability);
router.put('/item/:id/availability', toggleItemAvailability);
router.put('/items/:id/availability', toggleItemAvailability);
router.delete('/item/:id', deleteMenuItem);
router.delete('/items/:id', deleteMenuItem);

export { router as menuRouter };
