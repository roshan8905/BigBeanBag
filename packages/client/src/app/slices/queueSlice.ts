import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { QueueItem } from '@bigbeanbag/shared';

type QueueState = {
  items: QueueItem[];
};

const initialState: QueueState = { items: [] };

const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    queueUpdated: (state, action: PayloadAction<QueueItem[]>) => {
      state.items = action.payload;
    },
    clearQueue: () => initialState,
  },
});

export const { queueUpdated, clearQueue } = queueSlice.actions;
export const queueReducer = queueSlice.reducer;
