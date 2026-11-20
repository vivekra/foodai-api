import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { restaurantRouter } from '../modules/restaurants/restaurant.routes.js';
import { menuRouter } from '../modules/menu/menu.routes.js';
import { orderRouter } from '../modules/orders/order.routes.js';
import { deliveryRouter } from '../modules/delivery/delivery.routes.js';
import { paymentRouter } from '../modules/payments/payment.routes.js';
import { aiRouter } from '../modules/ai/ai.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { voiceRouter } from '../modules/voice/voice.routes.js';

const router = Router();

// Health check — keep alive endpoint (UptimeRobot / Koyeb / Docker health checks)
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'foodai-api',
    version: '0.1.0',
  });
});

// Mount modules
router.use('/auth', authRouter);
router.use('/restaurants', restaurantRouter);
router.use('/menu', menuRouter);
router.use('/orders', orderRouter);
router.use('/delivery', deliveryRouter);
router.use('/payments', paymentRouter);
router.use('/ai', aiRouter);
router.use('/admin', adminRouter);
router.use('/voice', voiceRouter);

export { router };
