import type { PlaybackState, QueueItem } from '@bigbeanbag/shared';
import { Mic2, Play } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { YouTubeStage } from '@/features/room/YouTubeStage';
import { getSocket } from '@/lib/socket';

export const PlaybackPanel = ({ canControl }: { canControl: boolean }) => {
  const queue = useAppSelector((state) => state.queue.items);
  const playback = useAppSelector((state) => state.playback.state);
  const current: QueueItem | null =
    playback?.currentItemId
      ? (queue.find((item) => item.id === playback.currentItemId) ?? null)
      : null;
  const nextUp = queue.find((item) => item.status === 'QUEUED') ?? null;
  const active: PlaybackState | null =
    playback && playback.status !== 'IDLE' && current ? playback : null;

  if (active && current) {
    return <YouTubeStage item={current} playback={active} canControl={canControl} />;
  }

  const start = () => getSocket().emit('playback:play', {}, () => undefined);

  return (
    <section className="card flex min-h-52 flex-col items-center justify-center p-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-bean-400/15 text-bean-300">
        <Mic2 size={22} />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold">Nothing on stage yet</h2>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-cream-400">
        {nextUp
          ? 'The queue has a track ready. Start playback and everyone follows along.'
          : 'Queue a song and the room can vote it to the top. Playback stays in sync for everyone.'}
      </p>

      {nextUp ? (
        <p className="mt-3 text-xs text-cream-500">
          Next up: <span className="text-cream-300">{nextUp.title}</span>
          {nextUp.artist ? ` · ${nextUp.artist}` : ''}
        </p>
      ) : null}

      {canControl && nextUp ? (
        <button type="button" className="btn-primary mt-4" onClick={start}>
          <Play size={15} /> Start playback
        </button>
      ) : null}

      {!canControl && nextUp ? (
        <p className="mt-3 text-xs text-cream-500">Playback starts when the host hits play.</p>
      ) : null}
    </section>
  );
};
