import { Router } from 'express';
import { register, login, getMe, logout } from './auth.controller.js';
import { validateBody } from '../../middleware/ValidateRequest.js';
import { RegisterSchema, LoginSchema } from '../../../validators/index.js';
import { authLimiter } from '../../middleware/RateLimit.js';

const router = Router();

router.post('/register', authLimiter, validateBody(RegisterSchema), register);
router.post('/login', authLimiter, validateBody(LoginSchema), login);
router.get('/me', getMe);
router.post('/logout', logout);

export { router as authRouter };
