import type { Prisma } from '@prisma/client';
import type {
  Battle as BattleDto,
  BattleVoteInput,
  CreateBattleInput,
} from '@bigbeanbag/shared';
import { AppError, ERROR_CODES } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';

export const battleInclude = {
  itemA: true,
  itemB: true,
  votes: { select: { itemId: true, userId: true } },
} satisfies Prisma.BattleInclude;

export type BattleRow = Prisma.BattleGetPayload<{ include: typeof battleInclude }>;

const entryVotes = (votes: { itemId: string }[], itemId: string) =>
  votes.filter((vote) => vote.itemId === itemId).length;

export const toBattleDto = (battle: BattleRow, userId: string): BattleDto => ({
  id: battle.id,
  status: battle.status,
  endsAt: battle.endsAt.toISOString(),
  entries: [
    {
      itemId: battle.itemAId,
      title: battle.itemA.title,
      artist: battle.itemA.artist,
      thumbnail: battle.itemA.thumbnail,
      votes: entryVotes(battle.votes, battle.itemAId),
    },
    {
      itemId: battle.itemBId,
      title: battle.itemB.title,
      artist: battle.itemB.artist,
      thumbnail: battle.itemB.thumbnail,
      votes: entryVotes(battle.votes, battle.itemBId),
    },
  ],
  myVoteItemId: battle.votes.find((vote) => vote.userId === userId)?.itemId ?? null,
  winnerItemId: battle.winnerItemId,
});

export const findBattleRow = (battleId: string) =>
  prisma.battle.findUnique({ where: { id: battleId }, include: battleInclude });

export const latestBattleRow = (roomId: string) =>
  prisma.battle.findFirst({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    include: battleInclude,
  });

export const ensureBattleFresh = async (roomId: string) => {
  const battle = await latestBattleRow(roomId);
  if (battle?.status === 'OPEN' && battle.endsAt.getTime() <= Date.now()) {
    await finalizeBattle(battle.id);
    return latestBattleRow(roomId);
  }

  return battle;
};

export const latestBattle = async (roomId: string, userId: string) => {
  const battle = await ensureBattleFresh(roomId);
  return battle ? toBattleDto(battle, userId) : null;
};

export const createBattle = async (roomId: string, userId: string, input: CreateBattleInput) => {
  const open = await prisma.battle.findFirst({
    where: { roomId, status: 'OPEN' },
    select: { id: true },
  });
  if (open) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Finish the open battle first', 400);
  }

  const items = await prisma.queueItem.findMany({
    where: { roomId, id: { in: [input.itemAId, input.itemBId] } },
    select: { id: true, status: true },
  });

  if (items.length !== 2) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Both songs must be in this room', 400);
  }
  if (items.some((item) => item.status !== 'QUEUED')) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Both songs must be waiting in the queue', 400);
  }

  const battle = await prisma.battle.create({
    data: {
      roomId,
      itemAId: input.itemAId,
      itemBId: input.itemBId,
      endsAt: new Date(Date.now() + input.durationSec * 1000),
    },
    include: battleInclude,
  });

  return toBattleDto(battle, userId);
};

export const voteBattle = async (roomId: string, userId: string, input: BattleVoteInput) => {
  const battle = await findBattleRow(input.battleId);
  if (!battle || battle.roomId !== roomId) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Battle not found', 404);
  }
  if (battle.status !== 'OPEN' || battle.endsAt.getTime() <= Date.now()) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'That battle has ended', 400);
  }
  if (input.itemId !== battle.itemAId && input.itemId !== battle.itemBId) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'That song is not in the battle', 400);
  }

  await prisma.battleVote.upsert({
    where: { battleId_userId: { battleId: battle.id, userId } },
    create: { battleId: battle.id, itemId: input.itemId, userId },
    update: { itemId: input.itemId },
  });

  return toBattleDto((await findBattleRow(battle.id)) as BattleRow, userId);
};

export const finalizeBattle = async (battleId: string) => {
  const battle = await findBattleRow(battleId);
  if (!battle || battle.status !== 'OPEN' || battle.endsAt.getTime() > Date.now()) return null;

  const votesA = entryVotes(battle.votes, battle.itemAId);
  const votesB = entryVotes(battle.votes, battle.itemBId);
  const winnerItemId =
    votesA === votesB
      ? battle.itemA.createdAt <= battle.itemB.createdAt
        ? battle.itemAId
        : battle.itemBId
      : votesA > votesB
        ? battle.itemAId
        : battle.itemBId;

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.battle.findUnique({ where: { id: battleId }, select: { status: true } });
    if (!fresh || fresh.status !== 'OPEN') return;

    await tx.battle.update({
      where: { id: battleId },
      data: { status: 'CLOSED', winnerItemId },
    });

    for (const vote of battle.votes.filter((entry) => entry.itemId === winnerItemId)) {
      await tx.vote.upsert({
        where: { itemId_userId: { itemId: winnerItemId, userId: vote.userId } },
        create: { itemId: winnerItemId, userId: vote.userId },
        update: {},
      });
    }
  });

  return { roomId: battle.roomId, winnerItemId };
};
