import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import passport from 'passport';
import { ZodError } from 'zod';
import { AppError, ERROR_CODES } from '@bigbeanbag/shared';
import { configurePassport } from './auth/passport';
import { authRouter } from './auth/routes';
import { prisma } from './lib/prisma';
import { apiLimiter, authLimiter } from './lib/rate-limit';
import { sessionMiddleware } from './lib/session';
import { authApiRouter } from './routes/auth';
import { healthRouter } from './routes/health';

configurePassport();

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api', healthRouter);
  app.use('/auth', authLimiter, authRouter);
  app.use('/api/auth', apiLimiter, authApiRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Route not found' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? 'Invalid request';
      res.status(400).json({ error: { code: ERROR_CODES.VALIDATION_FAILED, message } });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }

    console.error(error);
    res.status(500).json({ error: { code: ERROR_CODES.INTERNAL, message: 'Something went wrong' } });
  });

  return app;
};

export const checkDatabase = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};
