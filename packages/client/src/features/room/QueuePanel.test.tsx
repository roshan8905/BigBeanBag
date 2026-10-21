import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueItem, Room } from '@bigbeanbag/shared';
import { QueuePanel } from '@/features/room/QueuePanel';
import { queueReducer } from '@/app/slices/queueSlice';
import { roomReducer } from '@/app/slices/roomSlice';

const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('@/lib/socket', () => ({
  getSocket: () => ({ emit }),
}));

const room: Room = {
  id: 'room-1',
  code: 'ABCD1234',
  name: 'Test room',
  visibility: 'PUBLIC',
  ownerId: 'owner-1',
  locked: false,
  chatRestricted: false,
  addRestricted: false,
  autoplay: false,
  memberCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const item = (id: string, index: number): QueueItem => ({
  id,
  roomId: 'room-1',
  source: 'YOUTUBE',
  youtubeId: `video-${id}`,
  spotifyId: null,
  title: `Song ${index}`,
  artist: 'Test Artist',
  thumbnail: 'https://example.com/thumb.jpg',
  durationMs: 180_000,
  mediaType: 'MUSIC',
  status: 'QUEUED',
  addedBy: { id: 'owner-1', name: 'Owner' },
  voteCount: index,
  votedByMe: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const renderQueue = () => {
  const store = configureStore({
    reducer: { queue: queueReducer, room: roomReducer },
    preloadedState: {
      queue: { items: [item('one', 0), item('two', 1), item('three', 2)] },
      room: {
        room,
        me: { userId: 'owner-1', role: 'OWNER' as const },
        members: [],
        presentIds: [],
        serverOffsetMs: 0,
        connection: 'live' as const,
        error: '',
      },
    },
  });

  return render(
    <Provider store={store}>
      <QueuePanel canAdd canRemove onAdd={vi.fn()} />
    </Provider>,
  );
};

beforeEach(() => {
  emit.mockClear();
});

afterEach(cleanup);

describe('QueuePanel', () => {
  it('moves voting beside the row actions and exposes queue controls', () => {
    renderQueue();

    expect(screen.getByRole('button', { name: 'Reshuffle queue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Turn autoplay on' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Vote for this song' })[0] as HTMLElement);
    expect(emit).toHaveBeenCalledWith('queue:vote', { itemId: 'one' }, expect.any(Function));

    fireEvent.click(screen.getByRole('button', { name: 'Reshuffle queue' }));
    expect(emit).toHaveBeenCalledWith('queue:shuffle', expect.any(Function));

    fireEvent.click(screen.getByRole('button', { name: 'Turn autoplay on' }));
    expect(emit).toHaveBeenCalledWith('queue:autoplay', { enabled: true }, expect.any(Function));
  });

  it('opens the row menu and emits queue moves', () => {
    renderQueue();

    const handles = screen.getAllByRole('button', { name: 'Reorder song' });
    expect(handles).toHaveLength(3);

    fireEvent.click(handles[0] as HTMLElement);
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(emit).toHaveBeenCalledWith(
      'queue:move',
      { itemId: 'one', direction: 'down' },
      expect.any(Function),
    );
  });
});
