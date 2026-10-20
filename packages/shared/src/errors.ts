export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ROOM_LOCKED: 'ROOM_LOCKED',
  ROOM_FULL: 'ROOM_FULL',
  CHAT_RESTRICTED: 'CHAT_RESTRICTED',
  ADD_RESTRICTED: 'ADD_RESTRICTED',
  LINK_UNSUPPORTED: 'LINK_UNSUPPORTED',
  SPOTIFY_UNSUPPORTED: 'SPOTIFY_UNSUPPORTED',
  MEDIA_NOT_EMBEDDABLE: 'MEDIA_NOT_EMBEDDABLE',
  MEDIA_UNAVAILABLE: 'MEDIA_UNAVAILABLE',
  BANNED: 'BANNED',
  MUTED: 'MUTED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';
