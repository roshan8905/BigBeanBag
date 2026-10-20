import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Room, RoomMember, RoomSnapshot, Role } from '@bigbeanbag/shared';

type ConnectionState = 'idle' | 'connecting' | 'live' | 'error';

type RoomState = {
  room: Room | null;
  me: { userId: string; role: Role } | null;
  members: RoomMember[];
  presentIds: string[];
  serverOffsetMs: number;
  connection: ConnectionState;
  error: string;
};

const initialState: RoomState = {
  room: null,
  me: null,
  members: [],
  presentIds: [],
  serverOffsetMs: 0,
  connection: 'idle',
  error: '',
};

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    snapshotReceived: (
      state,
      action: PayloadAction<{ snapshot: RoomSnapshot; receivedAt: number }>,
    ) => {
      state.room = action.payload.snapshot.room;
      state.me = action.payload.snapshot.me;
      state.members = action.payload.snapshot.members;
      state.serverOffsetMs = action.payload.snapshot.serverNow - action.payload.receivedAt;
      state.connection = 'live';
      state.error = '';
    },
    membersReceived: (state, action: PayloadAction<RoomMember[]>) => {
      state.members = action.payload;
    },
    presenceReceived: (state, action: PayloadAction<string[]>) => {
      state.presentIds = action.payload;
    },
    roomReceived: (state, action: PayloadAction<Room>) => {
      state.room = action.payload;
    },
    connectionChanged: (state, action: PayloadAction<ConnectionState>) => {
      state.connection = action.payload;
    },
    errorReceived: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
    resetRoom: () => initialState,
  },
});

export const {
  snapshotReceived,
  membersReceived,
  presenceReceived,
  roomReceived,
  connectionChanged,
  errorReceived,
  resetRoom,
} = roomSlice.actions;

export const roomReducer = roomSlice.reducer;
export type { ConnectionState };
