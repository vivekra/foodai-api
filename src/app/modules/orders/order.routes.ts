import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} from './order.controller.js';
import { validateBody } from '../../middleware/ValidateRequest.js';
import { requireAuth } from '../../middleware/Auth.js';
import { CreateOrderSchema } from '../../../validators/index.js';

const router = Router();

router.post('/', validateBody(CreateOrderSchema), createOrder);
router.get('/', requireAuth, getOrders);
router.get('/:id', requireAuth, getOrderById);
router.patch('/:id/status', requireAuth, updateOrderStatus);
router.put('/:id/status', requireAuth, updateOrderStatus);
router.post('/:id/cancel', requireAuth, cancelOrder);

export { router as orderRouter };
