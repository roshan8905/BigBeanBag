import type { NextFunction, Request, Response } from 'express';
import { isTest } from '../env';
import { prisma } from './prisma';

export const testAuth = async (req: Request, _res: Response, next: NextFunction) => {
  if (!isTest) {
    next();
    return;
  }

  const userId = req.header('x-test-user-id');
  if (!userId) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) req.user = user;
  next();
};
