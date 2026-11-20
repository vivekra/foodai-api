import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} from './order.controller.js';
import { validateBody } from '../../middleware/ValidateRequest.js';
import { CreateOrderSchema } from '../../../validators/index.js';

const router = Router();

router.post('/', validateBody(CreateOrderSchema), createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);
router.put('/:id/status', updateOrderStatus);
router.post('/:id/cancel', cancelOrder);

export { router as orderRouter };
