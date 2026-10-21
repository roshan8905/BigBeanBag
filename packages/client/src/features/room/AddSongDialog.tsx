import { useEffect, useMemo, useState } from 'react';
import type { MediaFilter, MediaItem, ResolvedMedia } from '@bigbeanbag/shared';
import { Check, Link2, Loader2, Music2, Play, Plus, Search, Video } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { apiErrorMessage } from '@/lib/errors';
import { formatDuration } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { useResolveMediaMutation, useSearchMediaQuery } from '@/lib/api';

const filters: { value: MediaFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MUSIC', label: 'Music' },
  { value: 'VIDEO', label: 'Videos' },
];

const SearchResultRow = ({
  item,
  added,
  adding,
  onAdd,
}: {
  item: MediaItem;
  added: boolean;
  adding: boolean;
  onAdd: (item: MediaItem) => void;
}) => (
  <li className="flex items-center gap-3 rounded-xl border border-white/5 bg-ink-900/40 p-2">
    <div className="relative shrink-0">
      <img
        src={item.thumbnail}
        alt=""
        loading="lazy"
        className="h-12 w-20 rounded-lg object-cover"
      />
      <span className="absolute bottom-1 right-1 rounded bg-ink-950/85 px-1 text-[10px] font-medium text-cream-200">
        {formatDuration(item.durationMs)}
      </span>
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{item.title}</p>
      <p className="truncate text-xs text-cream-500">{item.artist ?? 'YouTube'}</p>
      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-cream-500">
        {item.mediaType === 'MUSIC' ? <Music2 size={10} /> : <Video size={10} />}
        {item.source === 'SPOTIFY_MATCHED' ? 'Spotify match' : item.mediaType.toLowerCase()}
      </span>
    </div>

    <button
      type="button"
      onClick={() => onAdd(item)}
      disabled={added || adding}
      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
        added
          ? 'bg-mint/15 text-mint'
          : 'bg-bean-400/15 text-bean-200 hover:bg-bean-400/25 disabled:opacity-50'
      }`}
    >
      {added ? (
        <span className="inline-flex items-center gap-1">
          <Check size={13} /> Added
        </span>
      ) : adding ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <span className="inline-flex items-center gap-1">
          <Plus size={13} /> Queue
        </span>
      )}
    </button>
  </li>
);

export const AddSongDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [tab, setTab] = useState<'search' | 'link'>('search');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<MediaFilter>('ALL');
  const [link, setLink] = useState('');
  const [resolved, setResolved] = useState<ResolvedMedia | null>(null);
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [addingKey, setAddingKey] = useState('');
  const [error, setError] = useState('');

  const searchArgs = useMemo(
    () => ({ query: debouncedQuery.trim(), filter }),
    [debouncedQuery, filter],
  );
  const { data, isFetching, error: searchError } = useSearchMediaQuery(searchArgs, {
    skip: !open || debouncedQuery.trim().length < 2,
  });
  const [resolveMedia, { isLoading: resolving }] = useResolveMediaMutation();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setTab('search');
    setQuery('');
    setDebouncedQuery('');
    setLink('');
    setResolved(null);
    setError('');
    setAddedKeys([]);
  }, [open]);

  const keyOf = (item: MediaItem) => `${item.source}:${item.youtubeId}`;

  const addToQueue = (item: MediaItem) =>
    new Promise<void>((resolve) => {
      const socket = getSocket();
      if (!socket.connected) {
        setError('Still connecting to the room. Try again in a second.');
        resolve();
        return;
      }

      setAddingKey(keyOf(item));
      setError('');

      socket.emit('queue:add', item, (result) => {
        if (result.ok) {
          setAddedKeys((current) => [...current, keyOf(item)]);
        } else {
          setError(result.message);
        }
        setAddingKey('');
        resolve();
      });
    });

  const handleResolve = async () => {
    setError('');
    setResolved(null);

    try {
      const result = await resolveMedia({ url: link.trim() }).unwrap();
      setResolved(result);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'That link could not be resolved'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add to the queue"
      description="Search YouTube or paste a YouTube and Spotify link. Spotify tracks play through their best YouTube match."
    >
      <div className="flex gap-1 rounded-xl bg-ink-900/70 p-1">
        <button
          type="button"
          onClick={() => setTab('search')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'search' ? 'bg-white/10 text-cream-100' : 'text-cream-400 hover:text-cream-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Search size={14} /> Search
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('link')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === 'link' ? 'bg-white/10 text-cream-100' : 'text-cream-400 hover:text-cream-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Link2 size={14} /> Paste a link
          </span>
        </button>
      </div>

      {tab === 'search' ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-500" />
              <input
                className="input pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search songs, artists, videos"
                autoFocus
              />
            </div>
            <div className="flex rounded-xl border border-white/10 bg-ink-900/60 p-1">
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`rounded-lg px-2.5 text-xs font-medium transition ${
                    filter === option.value
                      ? 'bg-bean-400/20 text-bean-200'
                      : 'text-cream-400 hover:text-cream-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-80 min-h-40 overflow-y-auto pr-1">
            {isFetching ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-cream-400">
                <Loader2 size={16} className="animate-spin" /> Searching YouTube
              </div>
            ) : null}

            {!isFetching && searchError ? (
              <p className="rounded-xl border border-coral/25 bg-coral/10 p-3 text-sm text-coral">
                {apiErrorMessage(searchError, 'Search is unavailable right now')}
              </p>
            ) : null}

            {!isFetching && !searchError && debouncedQuery.trim().length < 2 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center text-sm text-cream-500">
                <Play size={22} className="mb-2 text-cream-600" />
                Type at least two characters to search
              </div>
            ) : null}

            {!isFetching && data && data.items.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center text-sm text-cream-500">
                Nothing playable came back. Try another search or paste a link.
              </div>
            ) : null}

            {data && data.items.length > 0 ? (
              <ul className="space-y-2">
                {data.items.map((item) => (
                  <SearchResultRow
                    key={keyOf(item)}
                    item={item}
                    added={addedKeys.includes(keyOf(item))}
                    adding={addingKey === keyOf(item)}
                    onAdd={(entry) => void addToQueue(entry)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <input
              className="input"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://youtu.be/… or https://open.spotify.com/track/…"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleResolve();
              }}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              onClick={() => void handleResolve()}
              disabled={resolving || link.trim().length < 8}
            >
              {resolving ? <Loader2 size={15} className="animate-spin" /> : 'Find track'}
            </button>
          </div>

          {resolved ? (
            <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3">
              {resolved.needsConfirmation ? (
                <p className="mb-3 rounded-lg border border-bean-400/25 bg-bean-400/10 px-3 py-2 text-xs leading-relaxed text-bean-200">
                  Spotify cannot play inside BigBeanBag. We matched this track to a YouTube video — check the
                  match before queuing.
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <img
                  src={resolved.item.thumbnail}
                  alt=""
                  className="h-16 w-28 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{resolved.item.title}</p>
                  <p className="truncate text-xs text-cream-500">{resolved.item.artist ?? 'YouTube'}</p>
                  <p className="text-[11px] text-cream-500">
                    {formatDuration(resolved.item.durationMs)} ·{' '}
                    {resolved.needsConfirmation ? 'Matched YouTube video' : 'YouTube'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary shrink-0 text-xs"
                  onClick={() => void addToQueue(resolved.item)}
                  disabled={
                    addingKey === keyOf(resolved.item) ||
                    addedKeys.includes(keyOf(resolved.item))
                  }
                >
                  {addedKeys.includes(keyOf(resolved.item)) ? (
                    <>
                      <Check size={14} /> Added
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      {resolved.needsConfirmation ? 'Use this match' : 'Queue it'}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-white/5 bg-ink-900/30 p-4 text-xs leading-relaxed text-cream-500">
              YouTube videos need embedding enabled. Spotify albums, playlists, and episodes are rejected —
              paste a single track link.
            </p>
          )}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}

      <div className="mt-5 flex justify-end">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
};
