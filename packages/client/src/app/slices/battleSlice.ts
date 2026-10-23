import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Battle } from '@bigbeanbag/shared';

type BattleState = {
  battles: Battle[];
};

const initialState: BattleState = { battles: [] };

const battleSlice = createSlice({
  name: 'battle',
  initialState,
  reducers: {
    battlesLoaded: (state, action: PayloadAction<Battle[]>) => {
      state.battles = action.payload;
    },
    battleUpdated: (state, action: PayloadAction<Battle>) => {
      const index = state.battles.findIndex((battle) => battle.id === action.payload.id);
      if (index >= 0) state.battles[index] = action.payload;
      else state.battles.push(action.payload);
      state.battles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    battleEnded: (state, action: PayloadAction<Battle>) => {
      const index = state.battles.findIndex((battle) => battle.id === action.payload.id);
      if (index >= 0) state.battles[index] = action.payload;
      else state.battles.push(action.payload);
      state.battles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    clearBattle: () => initialState,
  },
});

export const { battlesLoaded, battleUpdated, battleEnded, clearBattle } = battleSlice.actions;
export const battleReducer = battleSlice.reducer;
