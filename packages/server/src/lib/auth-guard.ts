import type { NextFunction, Request, Response } from 'express';
import { AppError, ERROR_CODES } from '@bigbeanbag/shared';

export const requireUser = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({
      error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Sign in to continue' },
    });
    return;
  }

  next();
};

export const requireUserId = (req: Request) => {
  if (!req.user) throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Sign in to continue', 401);
  return req.user.id;
};
