import type { RoomSnapshot } from '@bigbeanbag/shared';
import { prisma } from '../lib/prisma';
import { roomDetailInclude, toMemberDto, toRoomDto, type RoomWithDetail } from '../lib/dto';
import { orderQueue, loadQueueRows, toQueueItemDto } from './queue';
import { ensurePlayback, toPlaybackDto } from './playback';

export const buildRoomSnapshot = async (roomId: string, userId: string): Promise<RoomSnapshot> => {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: roomDetailInclude });
  if (!room) throw new Error('Room missing while building snapshot');

  const membership = room.members.find((member) => member.userId === userId);
  if (!membership) throw new Error('Membership missing while building snapshot');

  const [rows, playbackRow] = await Promise.all([loadQueueRows(roomId), ensurePlayback(roomId)]);
  const ordered = orderQueue(rows);
  const current = ordered.find((row) => row.id === playbackRow.currentItemId) ?? null;

  return {
    room: toRoomDto(room as RoomWithDetail),
    me: { userId, role: membership.role },
    members: room.members.map(toMemberDto),
    queue: ordered.map((row) => toQueueItemDto(row, userId)),
    playback: toPlaybackDto(playbackRow, current?.durationMs ?? null),
    serverNow: Date.now(),
  };
};
