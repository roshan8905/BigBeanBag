import { Router } from 'express';
import { googleOAuthConfigured } from '../env';

export const authApiRouter = Router();

authApiRouter.get('/me', (req, res) => {
  const user = req.user;

  res.json({
    user: user
      ? { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }
      : null,
  });
});

authApiRouter.get('/config', (_req, res) => {
  res.json({ googleEnabled: googleOAuthConfigured });
});
