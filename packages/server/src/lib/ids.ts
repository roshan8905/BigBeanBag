import { randomBytes } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@bigbeanbag/shared';

export const generateRoomCode = () =>
  Array.from({ length: ROOM_CODE_LENGTH }, () =>
    ROOM_CODE_ALPHABET.charAt(Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)),
  ).join('');

export const generateInviteToken = () => randomBytes(24).toString('base64url');
