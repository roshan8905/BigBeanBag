import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { AuthState } from '@bigbeanbag/shared';

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
    getMe: builder.query<AuthState, void>({
      query: () => '/auth/me',
      providesTags: ['Auth'],
    }),
    getAuthConfig: builder.query<{ googleEnabled: boolean }, void>({
      query: () => '/auth/config',
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Auth'],
    }),
  }),
});

export const { useHealthQuery, useGetMeQuery, useGetAuthConfigQuery, useLogoutMutation } = api;
