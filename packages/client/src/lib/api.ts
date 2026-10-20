import type { AuthState, CreateRoomInput, InviteState, Room, RoomDetail, RoomList, UpdateRoomInput } from '@bigbeanbag/shared';
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
  tagTypes: ['Auth', 'Room', 'Rooms', 'Members', 'Queue', 'Playback', 'Chat', 'Poll', 'Battle'],
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
    getRooms: builder.query<RoomList, void>({
      query: () => '/rooms',
      providesTags: ['Rooms'],
    }),
    getRoom: builder.query<RoomDetail, string>({
      query: (code) => `/rooms/${code}`,
      providesTags: (_result, _error, code) => [{ type: 'Room', id: code }],
    }),
    createRoom: builder.mutation<RoomDetail, CreateRoomInput>({
      query: (body) => ({ url: '/rooms', method: 'POST', body }),
      invalidatesTags: ['Rooms'],
    }),
    joinRoom: builder.mutation<RoomDetail, { code: string }>({
      query: (body) => ({ url: '/rooms/join', method: 'POST', body }),
      invalidatesTags: (_result, _error, { code }) => [{ type: 'Room', id: code }, 'Rooms'],
    }),
    joinRoomByToken: builder.mutation<RoomDetail, string>({
      query: (token) => ({ url: `/rooms/join/${token}`, method: 'POST' }),
      invalidatesTags: ['Rooms'],
    }),
    updateRoom: builder.mutation<RoomDetail, { code: string; data: UpdateRoomInput }>({
      query: ({ code, data }) => ({ url: `/rooms/${code}`, method: 'PATCH', body: data }),
      invalidatesTags: (_result, _error, { code }) => [{ type: 'Room', id: code }, 'Rooms'],
    }),
    setRoomLocked: builder.mutation<RoomDetail, { code: string; locked: boolean }>({
      query: ({ code, locked }) => ({ url: `/rooms/${code}/lock`, method: 'POST', body: { locked } }),
      invalidatesTags: (_result, _error, { code }) => [{ type: 'Room', id: code }, 'Rooms'],
    }),
    deleteRoom: builder.mutation<void, string>({
      query: (code) => ({ url: `/rooms/${code}`, method: 'DELETE' }),
      invalidatesTags: ['Rooms'],
    }),
    getInvite: builder.query<InviteState, string>({
      query: (code) => `/rooms/${code}/invite`,
      providesTags: (_result, _error, code) => [{ type: 'Room', id: `${code}:invite` }],
    }),
    rotateInvite: builder.mutation<InviteState, string>({
      query: (code) => ({ url: `/rooms/${code}/invite/rotate`, method: 'POST' }),
      invalidatesTags: (_result, _error, code) => [{ type: 'Room', id: `${code}:invite` }],
    }),
    revokeInvite: builder.mutation<void, string>({
      query: (code) => ({ url: `/rooms/${code}/invite`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, code) => [{ type: 'Room', id: `${code}:invite` }],
    }),
  }),
});

export type { Room, RoomDetail, RoomList };

export const {
  useHealthQuery,
  useGetMeQuery,
  useGetAuthConfigQuery,
  useLogoutMutation,
  useGetRoomsQuery,
  useGetRoomQuery,
  useCreateRoomMutation,
  useJoinRoomMutation,
  useJoinRoomByTokenMutation,
  useUpdateRoomMutation,
  useSetRoomLockedMutation,
  useDeleteRoomMutation,
  useGetInviteQuery,
  useRotateInviteMutation,
  useRevokeInviteMutation,
} = api;
