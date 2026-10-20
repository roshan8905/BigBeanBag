import { Router } from 'express';
import passport from 'passport';
import { env, googleOAuthConfigured } from '../env';

export const authRouter = Router();

const failureRedirect = `${env.APP_URL}/login?error=google`;

authRouter.get('/google', (req, res, next) => {
  if (!googleOAuthConfigured) {
    res.status(503).json({
      error: { code: 'UNAUTHORIZED', message: 'Google sign-in is not configured on this server' },
    });
    return;
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: true as unknown as string,
  })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  if (!googleOAuthConfigured) {
    res.redirect(`${env.APP_URL}/login?error=unconfigured`);
    return;
  }

  passport.authenticate('google', { failureRedirect })(req, res, next);
}, (req, res) => {
  res.redirect(`${env.APP_URL}/rooms`);
});

authRouter.post('/logout', (req, res, next) => {
  req.logout((logoutError) => {
    if (logoutError) {
      next(logoutError);
      return;
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        next(sessionError);
        return;
      }

      res.clearCookie(env.SESSION_COOKIE_NAME);
      res.status(204).end();
    });
  });
});
