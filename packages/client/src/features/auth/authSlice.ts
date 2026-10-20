import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '@bigbeanbag/shared';
import { api } from '@/lib/api';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

type AuthStateShape = {
  user: AuthUser | null;
  status: AuthStatus;
};

const initialState: AuthStateShape = {
  user: null,
  status: 'loading',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedOut: (state) => {
      state.user = null;
      state.status = 'anonymous';
    },
    signedIn: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload;
      state.status = 'authenticated';
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(api.endpoints.getMe.matchPending, (state) => {
        state.status = 'loading';
      })
      .addMatcher(api.endpoints.getMe.matchFulfilled, (state, action) => {
        state.user = action.payload.user;
        state.status = action.payload.user ? 'authenticated' : 'anonymous';
      })
      .addMatcher(api.endpoints.getMe.matchRejected, (state) => {
        state.user = null;
        state.status = 'anonymous';
      })
      .addMatcher(api.endpoints.logout.matchFulfilled, (state) => {
        state.user = null;
        state.status = 'anonymous';
      });
  },
});

export const { signedOut, signedIn } = authSlice.actions;
export const authReducer = authSlice.reducer;
