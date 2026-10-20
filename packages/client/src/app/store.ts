import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from '@/features/auth/authSlice';
import { chatReducer } from './slices/chatSlice';
import { playbackReducer } from './slices/playbackSlice';
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
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
