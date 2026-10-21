import type { Prisma } from '@prisma/client';
import type {
  ClosePollInput,
  CreatePollInput,
  Poll as PollDto,
  VotePollInput,
} from '@bigbeanbag/shared';
import { AppError, ERROR_CODES, canControlPlayback } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';

export const pollInclude = {
  options: { orderBy: { position: 'asc' } },
  votes: { select: { optionId: true, userId: true } },
} satisfies Prisma.PollInclude;

export type PollRow = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

export const toPollDto = (poll: PollRow, userId: string): PollDto => ({
  id: poll.id,
  question: poll.question,
  status: poll.status,
  createdBy: poll.createdById,
  options: poll.options.map((option) => ({
    id: option.id,
    label: option.label,
    votes: poll.votes.filter((vote) => vote.optionId === option.id).length,
  })),
  totalVotes: poll.votes.length,
  myVoteOptionId: poll.votes.find((vote) => vote.userId === userId)?.optionId ?? null,
  createdAt: poll.createdAt.toISOString(),
});

export const findPollRow = (pollId: string) =>
  prisma.poll.findUnique({ where: { id: pollId }, include: pollInclude });

export const latestPollRow = (roomId: string) =>
  prisma.poll.findFirst({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    include: pollInclude,
  });

export const latestPoll = async (roomId: string, userId: string) => {
  const poll = await latestPollRow(roomId);
  return poll ? toPollDto(poll, userId) : null;
};

export const createPoll = async (roomId: string, userId: string, input: CreatePollInput) => {
  const open = await prisma.poll.findFirst({
    where: { roomId, status: 'OPEN' },
    select: { id: true },
  });
  if (open) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'Close the open poll before starting another',
      400,
    );
  }

  const poll = await prisma.poll.create({
    data: {
      roomId,
      createdById: userId,
      question: input.question,
      options: {
        create: input.options.map((label, position) => ({ label, position })),
      },
    },
    include: pollInclude,
  });

  return toPollDto(poll, userId);
};

export const votePoll = async (roomId: string, userId: string, input: VotePollInput) => {
  const poll = await findPollRow(input.pollId);
  if (!poll || poll.roomId !== roomId) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Poll not found', 404);
  }
  if (poll.status !== 'OPEN') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'That poll is closed', 400);
  }
  if (!poll.options.some((option) => option.id === input.optionId)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'That option is not part of the poll', 400);
  }

  const existing = poll.votes.find((vote) => vote.userId === userId);
  if (existing?.optionId === input.optionId) {
    await prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
  } else {
    await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId: poll.id, userId } },
      create: { pollId: poll.id, optionId: input.optionId, userId },
      update: { optionId: input.optionId },
    });
  }

  return toPollDto((await findPollRow(poll.id)) as PollRow, userId);
};

export const closePoll = async (
  roomId: string,
  userId: string,
  role: 'OWNER' | 'HOST' | 'MEMBER',
  input: ClosePollInput,
) => {
  const poll = await findPollRow(input.pollId);
  if (!poll || poll.roomId !== roomId) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Poll not found', 404);
  }
  if (poll.status === 'CLOSED') return toPollDto(poll, userId);

  if (poll.createdById !== userId && !canControlPlayback(role)) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      'Only the creator or a host can close this poll',
      403,
    );
  }

  await prisma.poll.update({
    where: { id: poll.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  return toPollDto((await findPollRow(poll.id)) as PollRow, userId);
};
