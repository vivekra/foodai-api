import { Router } from 'express';
import { handleInboundCall, createVoiceOrder } from './voice.controller.js';

const router = Router();

router.post('/inbound', handleInboundCall);
router.post('/order', createVoiceOrder);

export { router as voiceRouter };
