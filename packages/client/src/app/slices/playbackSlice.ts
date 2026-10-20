import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlaybackState } from '@bigbeanbag/shared';

type PlaybackSliceState = {
  state: PlaybackState | null;
};

const initialState: PlaybackSliceState = { state: null };

const playbackSlice = createSlice({
  name: 'playback',
  initialState,
  reducers: {
    playbackUpdated: (state, action: PayloadAction<PlaybackState>) => {
      state.state = action.payload;
    },
    clearPlayback: () => initialState,
  },
});

export const { playbackUpdated, clearPlayback } = playbackSlice.actions;
export const playbackReducer = playbackSlice.reducer;
