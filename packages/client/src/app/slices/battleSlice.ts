import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Battle } from '@bigbeanbag/shared';

type BattleState = {
  battle: Battle | null;
  ended: Battle | null;
};

const initialState: BattleState = { battle: null, ended: null };

const battleSlice = createSlice({
  name: 'battle',
  initialState,
  reducers: {
    battleUpdated: (state, action: PayloadAction<Battle>) => {
      if (state.ended?.id !== action.payload.id) state.ended = null;
      state.battle = action.payload;
    },
    battleEnded: (state, action: PayloadAction<Battle>) => {
      state.battle = action.payload;
      state.ended = action.payload;
    },
    clearBattle: () => initialState,
  },
});

export const { battleUpdated, battleEnded, clearBattle } = battleSlice.actions;
export const battleReducer = battleSlice.reducer;
