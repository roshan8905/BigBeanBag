import { Pool } from 'pg';
import { env, isProduction } from '../env';

const needsSsl = isProduction || /sslmode=(require|verify-full)/.test(env.DATABASE_URL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});
