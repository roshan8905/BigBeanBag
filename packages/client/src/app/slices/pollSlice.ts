import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Poll } from '@bigbeanbag/shared';

type PollState = {
  polls: Poll[];
};

const initialState: PollState = { polls: [] };

const pollSlice = createSlice({
  name: 'poll',
  initialState,
  reducers: {
    pollsLoaded: (state, action: PayloadAction<Poll[]>) => {
      state.polls = action.payload;
    },
    pollUpdated: (state, action: PayloadAction<Poll>) => {
      const index = state.polls.findIndex((poll) => poll.id === action.payload.id);
      if (index >= 0) state.polls[index] = action.payload;
      else state.polls.push(action.payload);
      state.polls.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    clearPoll: () => initialState,
  },
});

export const { pollsLoaded, pollUpdated, clearPoll } = pollSlice.actions;
export const pollReducer = pollSlice.reducer;
