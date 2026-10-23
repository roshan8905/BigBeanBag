import {
  AppError,
  ERROR_CODES,
  ClosePollSchema,
  CreateBattleSchema,
  CreatePollSchema,
  VotePollSchema,
  BattleVoteSchema,
  canControlPlayback,
} from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import {
  createBattle,
  finalizeBattle,
  findBattleRow,
  toBattleDto,
  voteBattle,
} from '../services/battle';
import { closePoll, createPoll, findPollRow, toPollDto, votePoll } from '../services/poll';
import { respond, type AppServer } from './ack';
import type { AppSocket } from './auth';
import { broadcastQueue, requireRole, requireRoomContext } from './broadcast';
import { takeToken } from './rate-limit';

const broadcastPoll = async (io: AppServer, roomId: string, pollId: string) => {
  const row = await findPollRow(pollId);
  if (!row) return;

  const sockets = await io.in(roomId).fetchSockets();
  for (const target of sockets) target.emit('poll:updated', toPollDto(row, target.data.userId));
};

const broadcastBattle = async (io: AppServer, roomId: string, battleId: string) => {
  const row = await findBattleRow(battleId);
  if (!row) return;

  const sockets = await io.in(roomId).fetchSockets();
  for (const target of sockets) {
    const dto = toBattleDto(row, target.data.userId);
    target.emit('battle:updated', dto);
  }
};

const reportBackgroundError = (error: unknown) => {
  console.error('Background battle task failed', error);
};

const scheduleBattleEnd = (io: AppServer, battleId: string, roomId: string, endsAt: Date) => {
  const delay = Math.max(endsAt.getTime() - Date.now(), 0);
  const timer = setTimeout(() => {
    endBattle(io, battleId, roomId).catch(reportBackgroundError);
  }, delay);

  timer.unref();
};

const endBattle = async (io: AppServer, battleId: string, roomId: string) => {
  const finished = await finalizeBattle(battleId);
  if (!finished) return;

  await broadcastBattle(io, roomId, battleId);
  const row = await findBattleRow(battleId);
  if (!row) return;

  const sockets = await io.in(roomId).fetchSockets();
  for (const target of sockets) {
    target.emit('battle:ended', toBattleDto(row, target.data.userId));
  }

  await broadcastQueue(io, roomId);
};

export const startBattleSweeper = (io: AppServer) => {
  const timer = setInterval(() => {
    const sweep = async () => {
      const expired = await prisma.battle.findMany({
        where: { status: 'OPEN', endsAt: { lte: new Date() } },
        select: { id: true, roomId: true },
      });

      for (const battle of expired) {
        await endBattle(io, battle.id, battle.roomId);
      }
    };

    sweep().catch(reportBackgroundError);
  }, 15_000);

  timer.unref();
  return timer;
};

export const registerGameHandlers = (io: AppServer, socket: AppSocket) => {
  socket.on('poll:create', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:poll`, 3, 30_000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Give the room a moment between polls', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const input = CreatePollSchema.parse(payload);
      const poll = await createPoll(roomId, userId, input);
      await broadcastPoll(io, roomId, poll.id);
      return poll;
    }),
  );

  socket.on('poll:vote', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:poll-vote`, 15, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Easy on the poll votes', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const input = VotePollSchema.parse(payload);
      const poll = await votePoll(roomId, userId, input);
      await broadcastPoll(io, roomId, poll.id);
      return poll;
    }),
  );

  socket.on('poll:close', (payload, ack) =>
    respond(ack, async () => {
      const { roomId, userId } = requireRoomContext(socket);
      const role = await requireRole(roomId, userId);
      const input = ClosePollSchema.parse(payload);
      const poll = await closePoll(roomId, userId, role, input);
      await broadcastPoll(io, roomId, poll.id);
      return poll;
    }),
  );

  socket.on('battle:create', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:battle`, 3, 30_000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Give the room a moment between battles', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const role = await requireRole(roomId, userId);
      if (!canControlPlayback(role)) {
        throw new AppError(ERROR_CODES.FORBIDDEN, 'Only the owner or a host can start a battle', 403);
      }

      const input = CreateBattleSchema.parse(payload);
      const battle = await createBattle(roomId, userId, input);
      scheduleBattleEnd(io, battle.id, roomId, new Date(battle.endsAt));
      await broadcastBattle(io, roomId, battle.id);
      return battle;
    }),
  );

  socket.on('battle:vote', (payload, ack) =>
    respond(ack, async () => {
      if (!takeToken(`${socket.id}:battle-vote`, 15, 5000)) {
        throw new AppError(ERROR_CODES.RATE_LIMITED, 'Easy on the battle votes', 429);
      }

      const { roomId, userId } = requireRoomContext(socket);
      const input = BattleVoteSchema.parse(payload);
      const battle = await voteBattle(roomId, userId, input);
      await broadcastBattle(io, roomId, battle.id);
      return battle;
    }),
  );
};
