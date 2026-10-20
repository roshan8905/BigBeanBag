import { z } from 'zod';
import { MAX_CHAT_LENGTH, ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from '../constants';

export const IdSchema = z.string().min(1).max(64);

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .refine((value) => [...value].every((char) => ROOM_CODE_ALPHABET.includes(char)), {
    message: 'Room codes only use A-Z and 2-9',
  });

export const DisplayNameSchema = z.string().trim().min(2).max(50);

export const ChatBodySchema = z.string().trim().min(1).max(MAX_CHAT_LENGTH);

export const EmojiSchema = z.string().trim().min(1).max(16);

export const EpochMsSchema = z.number().int().nonnegative();
