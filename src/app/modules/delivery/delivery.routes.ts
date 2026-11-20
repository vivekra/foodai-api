import { Router } from 'express';
import {
  getQuotes,
  dispatchCourier,
  getDeliveryTracking,
  getConfigs,
  saveConfig,
} from './delivery.controller.js';

const router = Router();

router.post('/quotes', getQuotes);
router.post('/dispatch', dispatchCourier);
router.get('/track/:orderId', getDeliveryTracking);
router.get('/configs/:restaurantId', getConfigs);
router.put('/configs/:restaurantId', saveConfig);

export { router as deliveryRouter };
