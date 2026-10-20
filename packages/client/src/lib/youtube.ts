export type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  destroy: () => void;
};

type PlayerEvent = { target: YouTubePlayer; data: number };

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerEvent) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

type YouTubeWindow = Window & {
  YT?: YouTubeNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let apiPromise: Promise<YouTubeNamespace> | null = null;

export const loadYouTubeApi = (): Promise<YouTubeNamespace> => {
  const scope = window as YouTubeWindow;
  if (scope.YT) return Promise.resolve(scope.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = scope.onYouTubeIframeAPIReady;
    scope.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (scope.YT) resolve(scope.YT);
      else reject(new Error('YouTube player failed to initialise'));
    };

    if (document.getElementById('youtube-iframe-api')) return;

    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => reject(new Error('Could not reach the YouTube player'));
    document.head.appendChild(script);
  });

  return apiPromise;
};

export const youtubeErrorCopy = (code: number) => {
  if (code === 101 || code === 150) {
    return 'The video owner blocked playback on other sites.';
  }
  if (code === 100) return 'That video is private or removed.';
  if (code === 2) return 'That video id is not valid.';
  return 'This video cannot play here right now.';
};
