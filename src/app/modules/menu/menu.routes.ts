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
import { requireAuth, requireRestaurantAccess } from '../../middleware/Auth.js';

const router = Router();

// Public menu browsing
router.get('/:restaurantId', getRestaurantMenu);
router.get('/restaurant/:restaurantId', getRestaurantMenu);

// Protected Merchant menu mutations
router.post('/category', requireAuth, requireRestaurantAccess, createCategory);
router.post('/categories', requireAuth, requireRestaurantAccess, createCategory);
router.put('/category/:id', requireAuth, requireRestaurantAccess, updateCategory);
router.put('/categories/:id', requireAuth, requireRestaurantAccess, updateCategory);
router.delete('/category/:id', requireAuth, requireRestaurantAccess, deleteCategory);
router.delete('/categories/:id', requireAuth, requireRestaurantAccess, deleteCategory);

router.post('/item', requireAuth, requireRestaurantAccess, createMenuItem);
router.post('/items', requireAuth, requireRestaurantAccess, createMenuItem);
router.put('/item/:id', requireAuth, requireRestaurantAccess, updateMenuItem);
router.put('/items/:id', requireAuth, requireRestaurantAccess, updateMenuItem);
router.patch('/item/:id/availability', requireAuth, requireRestaurantAccess, toggleItemAvailability);
router.patch('/items/:id/availability', requireAuth, requireRestaurantAccess, toggleItemAvailability);
router.put('/item/:id/availability', requireAuth, requireRestaurantAccess, toggleItemAvailability);
router.put('/items/:id/availability', requireAuth, requireRestaurantAccess, toggleItemAvailability);
router.delete('/item/:id', requireAuth, requireRestaurantAccess, deleteMenuItem);
router.delete('/items/:id', requireAuth, requireRestaurantAccess, deleteMenuItem);

export { router as menuRouter };
