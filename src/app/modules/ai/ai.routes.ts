import { Router } from 'express';
import { chatWithAssistant } from './ai.controller.js';

const router = Router();

router.post('/chat', chatWithAssistant);

export { router as aiRouter };
