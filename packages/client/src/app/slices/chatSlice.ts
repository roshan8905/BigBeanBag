import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage, ReactionSummary } from '@bigbeanbag/shared';

type ChatState = {
  messages: ChatMessage[];
  reactions: ReactionSummary[];
};

const initialState: ChatState = { messages: [], reactions: [] };

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    chatLoaded: (
      state,
      action: PayloadAction<{ messages: ChatMessage[]; reactions: ReactionSummary[] }>,
    ) => {
      state.messages = action.payload.messages;
      state.reactions = action.payload.reactions;
    },
    chatAppended: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
      if (state.messages.length > 200) state.messages.shift();
    },
    reactionsUpdated: (state, action: PayloadAction<ReactionSummary[]>) => {
      state.reactions = action.payload;
    },
    clearChat: () => initialState,
  },
});

export const { chatLoaded, chatAppended, reactionsUpdated, clearChat } = chatSlice.actions;
export const chatReducer = chatSlice.reducer;
