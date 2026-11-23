import { Router } from 'express';
import {
  getQuotes,
  dispatchCourier,
  getDeliveryTracking,
  getConfigs,
  saveConfig,
} from './delivery.controller.js';

import { requireAuth, requireRestaurantAccess } from '../../middleware/Auth.js';

const router = Router();

router.post('/quotes', getQuotes);
router.post('/dispatch', dispatchCourier);
router.get('/track/:orderId', getDeliveryTracking);
router.get('/configs/:restaurantId', requireAuth, requireRestaurantAccess, getConfigs);
router.put('/configs/:restaurantId', requireAuth, requireRestaurantAccess, saveConfig);

export { router as deliveryRouter };
