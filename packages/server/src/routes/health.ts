import { Router } from 'express';
import { checkDatabase } from '../app';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const database = await checkDatabase();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'degraded',
    database: database ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
