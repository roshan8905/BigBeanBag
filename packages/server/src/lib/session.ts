import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { env, isProduction } from '../env';
import { pool } from './pg';

const PgStore = connectPgSimple(session);

export const sessionStore = new PgStore({
  pool,
  tableName: 'session',
  createTableIfMissing: false,
});

const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30;

export const sessionMiddleware = session({
  store: sessionStore,
  name: env.SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: ONE_MONTH_MS,
  },
});
