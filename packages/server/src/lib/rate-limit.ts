import rateLimit from 'express-rate-limit';
import { ERROR_CODES } from '@bigbeanbag/shared';

const limitBody = {
  error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests. Take a breath and retry.' },
};

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitBody,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitBody,
});
