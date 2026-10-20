import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('health endpoint', () => {
  it('reports the api and database status', async () => {
    const response = await request(createApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns a structured 404 for unknown api routes', async () => {
    const response = await request(createApp()).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
