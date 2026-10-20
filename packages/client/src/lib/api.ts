import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export type HealthResponse = {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api', credentials: 'include' }),
  tagTypes: ['Auth', 'Room', 'Queue', 'Playback', 'Chat', 'Poll', 'Battle', 'Members'],
  endpoints: (builder) => ({
    health: builder.query<HealthResponse, void>({
      query: () => '/health',
    }),
  }),
});

export const { useHealthQuery } = api;
