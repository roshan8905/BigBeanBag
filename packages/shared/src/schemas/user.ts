import { z } from 'zod';
import { IdSchema } from './common';

export const RoleSchema = z.enum(['OWNER', 'HOST', 'MEMBER']);
export type Role = z.infer<typeof RoleSchema>;

export const PublicUserSchema = z.object({
  id: IdSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const AuthUserSchema = PublicUserSchema.extend({
  email: z.string().email(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthStateSchema = z.object({
  user: AuthUserSchema.nullable(),
});
export type AuthState = z.infer<typeof AuthStateSchema>;
