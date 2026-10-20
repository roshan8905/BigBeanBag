export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const SESSION_COOKIE_NAME = 'bbb.sid';
export const YOUTUBE_MUSIC_CATEGORY_ID = '10';
export const MAX_SEARCH_RESULTS = 12;
export const MAX_QUEUE_TITLE_LENGTH = 200;
export const MAX_CHAT_LENGTH = 500;
export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '🎉', '👏', '🤯'] as const;
export const MAX_POLL_OPTIONS = 6;
export const MIN_POLL_OPTIONS = 2;
export const DEFAULT_BATTLE_SECONDS = 60;
export const MIN_BATTLE_SECONDS = 15;
export const MAX_BATTLE_SECONDS = 300;
export const DRIFT_THRESHOLD_MS = 1500;
export const ALLOWED_LINK_HOSTS = [
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'open.spotify.com',
] as const;
export const SPOTIFY_TRACK_PREFIX = '/track/';
export const SPOTIFY_UNSUPPORTED_PREFIXES = ['/album/', '/playlist/', '/episode/', '/show/', '/artist/'] as const;
