import { Router } from 'express';
import passport from 'passport';
import { env, googleOAuthConfigured, isProduction } from '../env';

export const authRouter = Router();

const failureRedirect = `${env.APP_URL}/login?error=google`;
const returnToCookie = 'bbb.returnTo';

const safeReturnTo = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/rooms';

authRouter.get('/google', (req, res, next) => {
  if (!googleOAuthConfigured) {
    res.status(503).json({
      error: { code: 'UNAUTHORIZED', message: 'Google sign-in is not configured on this server' },
    });
    return;
  }

  res.cookie(returnToCookie, safeReturnTo(req.query.returnTo), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 10 * 60 * 1000,
  });

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

  passport.authenticate(
    'google',
    { failureRedirect },
    (error: Error | null, user: Express.User | false | undefined) => {
      if (error || !user) {
        res.redirect(failureRedirect);
        return;
      }

      req.session.regenerate((regenerateError) => {
        if (regenerateError) {
          next(regenerateError);
          return;
        }

        req.logIn(user, (loginError) => {
          if (loginError) {
            next(loginError);
            return;
          }

          const returnTo = safeReturnTo(req.cookies?.[returnToCookie]);
          res.clearCookie(returnToCookie);
          res.redirect(`${env.APP_URL}${returnTo}`);
        });
      });
    },
  )(req, res, next);
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
