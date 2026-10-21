import { useEffect, useState } from 'react';
import type { QueueItem } from '@bigbeanbag/shared';
import {
  ArrowDown,
  ArrowUp,
  ChevronUp,
  ListMusic,
  Loader2,
  Menu,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  Trash2,
  Youtube,
} from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { formatDuration } from '@/lib/format';
import { getSocket } from '@/lib/socket';

const QueueRow = ({
  item,
  index,
  canRemove,
  canReorder,
  canMoveUp,
  canMoveDown,
  voting,
  moving,
  menuOpen,
  onVote,
  onRemove,
  onToggleMenu,
  onMove,
}: {
  item: QueueItem;
  index: number;
  canRemove: boolean;
  canReorder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  voting: boolean;
  moving: boolean;
  menuOpen: boolean;
  onVote: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onToggleMenu: (itemId: string) => void;
  onMove: (itemId: string, direction: 'up' | 'down') => void;
}) => {
  const playing = item.status === 'PLAYING';

  return (
    <li
      className={`relative flex items-center gap-3 rounded-xl border p-2.5 transition ${
        playing ? 'border-bean-400/40 bg-bean-400/10' : 'border-white/5 bg-ink-900/40'
      }`}
    >
      {canReorder ? (
        <div className="relative shrink-0" data-queue-menu>
          <button
            type="button"
            onClick={() => onToggleMenu(item.id)}
            disabled={moving}
            aria-label="Reorder song"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`rounded-lg p-1.5 transition ${
              menuOpen ? 'bg-white/10 text-cream-100' : 'text-cream-500 hover:bg-white/10 hover:text-cream-200'
            } disabled:opacity-40`}
          >
            {moving ? <Loader2 size={16} className="animate-spin" /> : <Menu size={16} />}
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-32 rounded-xl border border-white/10 bg-ink-900 p-1 shadow-panel"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => onMove(item.id, 'up')}
                disabled={!canMoveUp || moving}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-cream-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp size={13} /> Move up
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => onMove(item.id, 'down')}
                disabled={!canMoveDown || moving}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-cream-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowDown size={13} /> Move down
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative shrink-0">
        <img src={item.thumbnail} alt="" loading="lazy" className="h-11 w-[4.5rem] rounded-lg object-cover" />
        {playing ? (
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-ink-950/55">
            <Play size={16} className="fill-cream-100 text-cream-100" />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-cream-500">
          {item.artist ?? 'YouTube'} · added by {item.addedBy.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-cream-500">
          {playing ? (
            <span className="text-bean-300">Playing now</span>
          ) : (
            <span>#{index + 1} up next</span>
          )}
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Youtube size={10} /> {formatDuration(item.durationMs)}
          </span>
          {item.source === 'SPOTIFY_MATCHED' ? (
            <span className="rounded bg-mint/15 px-1 text-mint">spotify match</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onVote(item.id)}
          disabled={playing || voting}
          aria-label={item.votedByMe ? 'Remove your vote' : 'Vote for this song'}
          aria-pressed={item.votedByMe}
          className={`flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition ${
            item.votedByMe
              ? 'bg-bean-400 text-ink-950'
              : 'bg-white/5 text-cream-300 hover:bg-white/10 disabled:opacity-40'
          }`}
        >
          <ChevronUp size={14} />
          {voting ? <Loader2 size={11} className="animate-spin" /> : <span>{item.voteCount}</span>}
        </button>

        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label="Remove from queue"
            className="rounded-lg p-1.5 text-cream-500 hover:bg-coral/10 hover:text-coral"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
    </li>
  );
};

export const QueuePanel = ({
  canAdd,
  canRemove,
  onAdd,
}: {
  canAdd: boolean;
  canRemove: boolean;
  onAdd: () => void;
}) => {
  const items = useAppSelector((state) => state.queue.items);
  const autoplay = useAppSelector((state) => state.room.room?.autoplay ?? false);
  const [votingId, setVotingId] = useState('');
  const [movingId, setMovingId] = useState('');
  const [openMenuId, setOpenMenuId] = useState('');
  const [shuffling, setShuffling] = useState(false);
  const [autoplayBusy, setAutoplayBusy] = useState(false);
  const [error, setError] = useState('');
  const queued = items.filter((item) => item.status === 'QUEUED');
  const canManage = canRemove;

  useEffect(() => {
    if (!openMenuId) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-queue-menu]')) return;
      setOpenMenuId('');
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId('');
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuId]);

  const vote = (itemId: string) => {
    setVotingId(itemId);
    setError('');
    getSocket().emit('queue:vote', { itemId }, (result) => {
      setVotingId('');
      if (!result.ok) setError(result.message);
    });
  };

  const remove = (itemId: string) => {
    setError('');
    getSocket().emit('queue:remove', { itemId }, (result) => {
      if (!result.ok) setError(result.message);
    });
  };

  const shuffle = () => {
    if (!canManage || queued.length < 2) return;
    setShuffling(true);
    setError('');
    getSocket().emit('queue:shuffle', (result) => {
      setShuffling(false);
      if (!result.ok) setError(result.message);
    });
  };

  const move = (itemId: string, direction: 'up' | 'down') => {
    setOpenMenuId('');
    setMovingId(itemId);
    setError('');
    getSocket().emit('queue:move', { itemId, direction }, (result) => {
      setMovingId('');
      if (!result.ok) setError(result.message);
    });
  };

  const toggleAutoplay = () => {
    if (!canManage) return;
    setAutoplayBusy(true);
    setError('');
    getSocket().emit('queue:autoplay', { enabled: !autoplay }, (result) => {
      setAutoplayBusy(false);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <section className="card flex min-h-[18rem] flex-col p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListMusic size={16} className="text-bean-300" /> Queue
          <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-cream-400">
            {queued.length}
          </span>
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            className="btn-ghost px-2 py-1.5 text-[11px]"
            onClick={shuffle}
            disabled={!canManage || queued.length < 2 || shuffling}
            aria-label="Reshuffle queue"
            title={canManage ? 'Reshuffle the queued songs' : 'Only hosts can reshuffle the queue'}
          >
            {shuffling ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
            <span className="hidden sm:inline">Reshuffle</span>
          </button>
          <button
            type="button"
            className={`btn-ghost px-2 py-1.5 text-[11px] ${
              autoplay ? 'border-bean-400/40 bg-bean-400/15 text-bean-200' : ''
            }`}
            onClick={toggleAutoplay}
            disabled={!canManage || autoplayBusy}
            aria-label={autoplay ? 'Turn autoplay off' : 'Turn autoplay on'}
            aria-pressed={autoplay}
            title={
              !canManage
                ? 'Only hosts can change autoplay'
                : autoplay
                  ? 'Autoplay is on — suggestions fill the queue when it runs out'
                  : 'Play songs from suggestions when the queue runs out'
            }
          >
            {autoplayBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span className="hidden sm:inline">Autoplay</span>
          </button>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            onClick={onAdd}
            disabled={!canAdd}
            title={canAdd ? 'Add a song' : 'Only hosts can add songs right now'}
          >
            <Plus size={14} /> Add song
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-xs text-coral">{error}</p> : null}

      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const queueIndex = queued.findIndex((entry) => entry.id === item.id);
            const reorderable = canManage && item.status === 'QUEUED';

            return (
              <QueueRow
                key={item.id}
                item={item}
                index={queueIndex >= 0 ? queueIndex : 0}
                canRemove={canRemove}
                canReorder={reorderable}
                canMoveUp={queueIndex > 0}
                canMoveDown={queueIndex >= 0 && queueIndex < queued.length - 1}
                voting={votingId === item.id}
                moving={movingId === item.id}
                menuOpen={openMenuId === item.id}
                onVote={vote}
                onRemove={remove}
                onToggleMenu={(itemId) => setOpenMenuId((current) => (current === itemId ? '' : itemId))}
                onMove={move}
              />
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-cream-500">
            <ListMusic size={20} />
          </span>
          <p className="mt-3 text-sm font-medium">The queue is empty</p>
          <p className="mt-1 max-w-xs text-xs text-cream-500">
            {canAdd
              ? 'Search for a song or paste a link. The room votes on what plays next.'
              : 'Only hosts can add songs right now. Ask one to queue something.'}
          </p>
          {canAdd ? (
            <button type="button" className="btn-ghost mt-3 text-xs" onClick={onAdd}>
              <Plus size={14} /> Add the first song
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
};
