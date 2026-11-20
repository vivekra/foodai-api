import { Router } from 'express';
import {
  createCheckout,
  onboardConnect,
  getConnectStatus,
  handleWebhook,
} from './payment.controller.js';

const router = Router();

router.post('/create-checkout-session', createCheckout);
router.post('/onboard', onboardConnect);
router.get('/status/:restaurantId', getConnectStatus);
router.post('/webhook', handleWebhook);

export { router as paymentRouter };
