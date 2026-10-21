import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaybackState, QueueItem } from '@bigbeanbag/shared';
import { Headphones, Loader2, Pause, Play, SkipForward, Volume2 } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { formatDuration } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { loadYouTubeApi, youtubeErrorCopy, type YouTubePlayer } from '@/lib/youtube';

export const YouTubeStage = ({
  item,
  playback,
  canControl,
}: {
  item: QueueItem;
  playback: PlaybackState;
  canControl: boolean;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const seekTimer = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const serverOffset = useAppSelector((state) => state.room.serverOffsetMs);

  const itemRef = useRef(item);
  const playbackRef = useRef(playback);
  const canControlRef = useRef(canControl);
  const offsetRef = useRef(serverOffset);
  const joinedRef = useRef(joined);

  itemRef.current = item;
  playbackRef.current = playback;
  canControlRef.current = canControl;
  offsetRef.current = serverOffset;
  joinedRef.current = joined;

  const duration = playback.durationMs ?? item.durationMs;
  const elapsed =
    playback.status === 'PLAYING'
      ? playback.positionMs + Math.max(now + serverOffset - playback.updatedAt, 0)
      : playback.positionMs;
  const displayMs = Math.max(Math.min(scrubMs ?? elapsed, duration), 0);
  const progress = duration ? Math.min(displayMs / duration, 1) : 0;

  const handleFailure = (result: { ok: boolean; message?: string }) => {
    if (!result.ok && result.message) setError(result.message);
  };

  const syncPlayer = useCallback((force = false) => {
    const player = playerRef.current;
    const state = playbackRef.current;
    if (!player) return;

    const serverNow = Date.now() + offsetRef.current;

    if (state.status === 'PLAYING') {
      const target = Math.max((state.positionMs + (serverNow - state.updatedAt)) / 1000, 0);
      if (force || Math.abs(player.getCurrentTime() - target) > 1.5) {
        player.seekTo(target, true);
      }
      if (player.getPlayerState() !== 1) player.playVideo();
      return;
    }

    if (state.status === 'PAUSED') {
      if (player.getPlayerState() === 1) player.pauseVideo();
      const target = state.positionMs / 1000;
      if (force || Math.abs(player.getCurrentTime() - target) > 1) player.seekTo(target, true);
      return;
    }

    player.pauseVideo();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    syncPlayer();
  }, [ready, playback.status, playback.positionMs, playback.updatedAt, syncPlayer]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => syncPlayer(), 2000);
    return () => window.clearInterval(timer);
  }, [ready, syncPlayer]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    setReady(false);
    setError('');

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        host.innerHTML = '';
        const mount = document.createElement('div');
        host.appendChild(mount);

        new YT.Player(mount, {
          videoId: item.youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              event.target.mute();
              setReady(true);

              const state = playbackRef.current;
              const serverNow = Date.now() + offsetRef.current;
              const target =
                state.status === 'PLAYING'
                  ? (state.positionMs + (serverNow - state.updatedAt)) / 1000
                  : state.positionMs / 1000;

              event.target.seekTo(Math.max(target, 0), true);
              if (state.status === 'PLAYING') event.target.playVideo();
              if (joinedRef.current) {
                event.target.unMute();
                event.target.setVolume(100);
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED && canControlRef.current) {
                getSocket().emit('playback:ended', { itemId: itemRef.current.id }, () => undefined);
              }
            },
            onError: (event) => setError(youtubeErrorCopy(event.data)),
          },
        });
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      if (seekTimer.current) window.clearTimeout(seekTimer.current);
    };
  }, [item.youtubeId]);

  const joinAudio = () => {
    setJoined(true);
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.setVolume(100);
    syncPlayer(true);
  };

  const togglePlayback = () => {
    const player = playerRef.current;
    const positionMs = player ? Math.floor(player.getCurrentTime() * 1000) : Math.floor(displayMs);
    const socket = getSocket();

    if (playback.status === 'PLAYING') {
      socket.emit('playback:pause', { positionMs }, handleFailure);
    } else {
      socket.emit('playback:play', { positionMs }, handleFailure);
    }
  };

  const scrub = (positionMs: number) => {
    setScrubMs(positionMs);
    if (seekTimer.current) window.clearTimeout(seekTimer.current);
    seekTimer.current = window.setTimeout(() => {
      getSocket().emit('playback:seek', { positionMs }, handleFailure);
      setScrubMs(null);
    }, 250);
  };

  const skip = () => getSocket().emit('playback:skip', handleFailure);

  return (
    <section className="card overflow-hidden">
      <div className="relative aspect-video w-full bg-ink-950">
        <div ref={hostRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />

        {ready && canControl && !error ? (
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={playback.status === 'PLAYING' ? 'Pause video' : 'Play video'}
            title={playback.status === 'PLAYING' ? 'Pause' : 'Play'}
            className="absolute inset-0 cursor-pointer"
          />
        ) : null}

        {!ready && !error ? (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/80">
            <Loader2 size={22} className="animate-spin text-bean-300" />
          </div>
        ) : null}

        {ready && !joined && !error ? (
          <button
            type="button"
            onClick={joinAudio}
            className="absolute inset-0 grid place-items-center bg-ink-950/70 text-center backdrop-blur-[1px]"
          >
            <span className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full bg-bean-400 text-ink-950">
                <Headphones size={24} />
              </span>
              <span className="font-display text-base font-semibold text-cream-100">Tap to join audio</span>
              <span className="max-w-xs text-xs text-cream-400">
                Playback stays synced to the room. Tap once to hear it.
              </span>
            </span>
          </button>
        ) : null}

        {error ? (
          <div className="absolute inset-0 grid place-items-center bg-ink-950/85 p-6 text-center">
            <div>
              <p className="text-sm text-coral">{error}</p>
              {canControl ? (
                <button type="button" className="btn-ghost mt-3 text-xs" onClick={skip}>
                  <SkipForward size={14} /> Skip this one
                </button>
              ) : (
                <p className="mt-2 text-xs text-cream-500">Ask a host to skip it.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-3">
          {canControl ? (
            <button
              type="button"
              onClick={togglePlayback}
              aria-label={playback.status === 'PLAYING' ? 'Pause playback' : 'Resume playback'}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-bean-400 text-ink-950 transition hover:bg-bean-300"
            >
              {playback.status === 'PLAYING' ? <Pause size={16} /> : <Play size={16} />}
            </button>
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-cream-400">
              <Volume2 size={16} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[11px] text-cream-500">
              <span>{formatDuration(displayMs)}</span>
              <span>{formatDuration(duration)}</span>
            </div>

            {canControl ? (
              <input
                type="range"
                min={0}
                max={duration}
                step={1000}
                value={displayMs}
                onChange={(event) => scrub(Number(event.target.value))}
                aria-label="Seek"
                className="mt-1 w-full accent-bean-400"
              />
            ) : (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-bean-400" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>

          {canControl ? (
            <button
              type="button"
              onClick={skip}
              aria-label="Skip track"
              className="rounded-lg p-2 text-cream-400 hover:bg-white/5 hover:text-cream-100"
            >
              <SkipForward size={17} />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-cream-500">
          <span className="min-w-0 truncate">
            {item.title}
            {item.artist ? ` · ${item.artist}` : ''}
            {item.source === 'SPOTIFY_MATCHED' ? ' · Spotify match' : ''}
          </span>
          <span className="shrink-0">
            {canControl ? 'You control playback' : 'Host controls playback'}
          </span>
        </div>
      </div>
    </section>
  );
};
