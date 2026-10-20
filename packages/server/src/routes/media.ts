import { Router } from 'express';
import { ResolveLinkSchema, SearchQuerySchema } from '@bigbeanbag/shared';
import { asyncHandler } from '../lib/async-handler';
import { requireUser } from '../lib/auth-guard';
import { searchLimiter } from '../lib/rate-limit';
import { resolveMedia, searchMedia } from '../services/media';

export const mediaRouter = Router();

mediaRouter.use(requireUser);
mediaRouter.use(searchLimiter);

mediaRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { query, filter, limit } = SearchQuerySchema.parse(req.query);
    res.json({ items: await searchMedia(query, filter, limit) });
  }),
);

mediaRouter.post(
  '/resolve',
  asyncHandler(async (req, res) => {
    const { url } = ResolveLinkSchema.parse(req.body);
    res.json(await resolveMedia(url));
  }),
);
