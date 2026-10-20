import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Poll } from '@bigbeanbag/shared';

type PollState = {
  poll: Poll | null;
};

const initialState: PollState = { poll: null };

const pollSlice = createSlice({
  name: 'poll',
  initialState,
  reducers: {
    pollUpdated: (state, action: PayloadAction<Poll>) => {
      state.poll = action.payload;
    },
    clearPoll: () => initialState,
  },
});

export const { pollUpdated, clearPoll } = pollSlice.actions;
export const pollReducer = pollSlice.reducer;
