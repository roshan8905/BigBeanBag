import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from '@/features/auth/authSlice';
import { battleReducer } from './slices/battleSlice';
import { chatReducer } from './slices/chatSlice';
import { playbackReducer } from './slices/playbackSlice';
import { pollReducer } from './slices/pollSlice';
import { queueReducer } from './slices/queueSlice';
import { roomReducer } from './slices/roomSlice';
import { api } from '@/lib/api';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    room: roomReducer,
    queue: queueReducer,
    playback: playbackReducer,
    chat: chatReducer,
    poll: pollReducer,
    battle: battleReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
