import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env, googleOAuthConfigured } from '../env';
import { prisma } from '../lib/prisma';

export const configurePassport = () => {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user ?? false);
    } catch (error) {
      done(error as Error);
    }
  });

  if (!googleOAuthConfigured) return;

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        state: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            done(new Error('Google account did not share an email address'));
            return;
          }

          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const user = await prisma.user.upsert({
            where: { googleId: profile.id },
            update: { name: profile.displayName, email, avatarUrl },
            create: { googleId: profile.id, name: profile.displayName, email, avatarUrl },
          });

          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
};
