import { useState, type CSSProperties, type ReactNode } from 'react';
import type { QueueItem } from '@bigbeanbag/shared';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
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
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { queueUpdated } from '@/app/slices/queueSlice';
import { formatDuration } from '@/lib/format';
import { getSocket } from '@/lib/socket';

const QueueRow = ({
  item,
  index,
  canRemove,
  dragHandle,
  setNodeRef,
  style,
  isDragging,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  canRemove: boolean;
  dragHandle?: ReactNode;
  setNodeRef?: (node: HTMLLIElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
  onRemove: (itemId: string) => void;
}) => {
  const playing = item.status === 'PLAYING';

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-3 rounded-xl border p-2.5 transition ${
        playing ? 'border-bean-400/40 bg-bean-400/10' : 'border-white/5 bg-ink-900/40'
      } ${isDragging ? 'z-20 border-bean-400/60 bg-ink-800 opacity-90 shadow-2xl' : ''}`}
    >
      {dragHandle ? <div className="shrink-0">{dragHandle}</div> : null}

      <div className="relative shrink-0">
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          className="h-11 w-[4.5rem] rounded-lg object-cover"
        />
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

      {canRemove ? (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove from queue"
          className="shrink-0 rounded-lg p-1.5 text-cream-500 hover:bg-coral/10 hover:text-coral"
        >
          <Trash2 size={15} />
        </button>
      ) : null}
    </li>
  );
};

const SortableQueueRow = ({
  item,
  index,
  canRemove,
  canManage,
  canReorder,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  canRemove: boolean;
  canManage: boolean;
  canReorder: boolean;
  onRemove: (itemId: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canReorder });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = canManage ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      disabled={!canReorder}
      aria-label="Drag to reorder"
      title={`Drag ${item.title} to reorder`}
      className="cursor-grab touch-none rounded-lg p-1.5 text-cream-500 transition hover:bg-white/10 hover:text-cream-200 active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
    >
      <Menu size={16} />
    </button>
  ) : undefined;

  return (
    <QueueRow
      item={item}
      index={index}
      canRemove={canRemove}
      dragHandle={dragHandle}
      setNodeRef={(node) => setNodeRef(node)}
      style={style}
      isDragging={isDragging}
      onRemove={onRemove}
    />
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
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => state.queue.items);
  const autoplay = useAppSelector((state) => state.room.room?.autoplay ?? false);
  const [reordering, setReordering] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [autoplayBusy, setAutoplayBusy] = useState(false);
  const [error, setError] = useState('');
  const playing = items.find((item) => item.status === 'PLAYING') ?? null;
  const queued = items.filter((item) => item.status === 'QUEUED');
  const canManage = canRemove;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  const reorder = ({ active, over }: DragEndEvent) => {
    if (!canManage || reordering || !over || active.id === over.id) return;

    const fromIndex = queued.findIndex((item) => item.id === active.id);
    const toIndex = queued.findIndex((item) => item.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;

    const previous = items;
    const next = [...(playing ? [playing] : []), ...arrayMove(queued, fromIndex, toIndex)];

    setReordering(true);
    setError('');
    dispatch(queueUpdated(next));

    getSocket().emit('queue:move', { itemId: String(active.id), toIndex }, (result) => {
      setReordering(false);
      if (!result.ok) {
        dispatch(queueUpdated(previous));
        setError(result.message);
        return;
      }

      dispatch(queueUpdated(result.data.items));
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
            disabled={!canManage || queued.length < 2 || shuffling || reordering}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
          <ul className="mt-3 space-y-2">
            {playing ? (
              <QueueRow item={playing} index={0} canRemove={canRemove} onRemove={remove} />
            ) : null}
            <SortableContext
              items={queued.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {queued.map((item, index) => (
                <SortableQueueRow
                  key={item.id}
                  item={item}
                  index={index}
                  canRemove={canRemove}
                  canManage={canManage}
                  canReorder={canManage && !reordering}
                  onRemove={remove}
                />
              ))}
            </SortableContext>
          </ul>
        </DndContext>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-cream-500">
            <ListMusic size={20} />
          </span>
          <p className="mt-3 text-sm font-medium">The queue is empty</p>
          <p className="mt-1 max-w-xs text-xs text-cream-500">
            {canAdd
              ? 'Search for a song or paste a link. Hosts can drag songs into the order they want.'
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
