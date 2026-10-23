import { configureStore } from '@reduxjs/toolkit';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it } from 'vitest';
import type { Poll } from '@bigbeanbag/shared';
import { ChatPanel } from '@/features/room/ChatPanel';
import { battleReducer } from '@/app/slices/battleSlice';
import { chatReducer } from '@/app/slices/chatSlice';
import { pollReducer } from '@/app/slices/pollSlice';
import { queueReducer } from '@/app/slices/queueSlice';

const makePoll = (id: string, question: string, createdAt: string): Poll => ({
  id,
  question,
  status: 'OPEN',
  createdBy: 'host',
  options: [
    { id: `${id}-a`, label: 'First song', votes: 1 },
    { id: `${id}-b`, label: 'Second song', votes: 0 },
  ],
  totalVotes: 1,
  myVoteOptionId: null,
  createdAt,
});

const renderChat = ({
  canControl = false,
  polls = [],
}: {
  canControl?: boolean;
  polls?: Poll[];
} = {}) => {
  const store = configureStore({
    reducer: {
      chat: chatReducer,
      poll: pollReducer,
      battle: battleReducer,
      queue: queueReducer,
    },
    preloadedState: {
      chat: { messages: [], reactions: [] },
      poll: { polls },
      battle: { battles: [] },
      queue: { items: [] },
    },
  });

  return render(
    <Provider store={store}>
      <ChatPanel meId="me" canChat canControl={canControl} />
    </Provider>,
  );
};

afterEach(cleanup);

describe('ChatPanel', () => {
  it('opens poll and battle options from the composer', () => {
    renderChat();

    fireEvent.click(screen.getByRole('button', { name: 'Start a poll or battle' }));

    expect((screen.getByRole('button', { name: 'Poll' }) as HTMLButtonElement).disabled).toBe(false);
    const battle = screen.getByRole('button', { name: 'Battle' }) as HTMLButtonElement;
    expect(battle.disabled).toBe(true);
    expect(screen.getByText('Only the owner or a host can start a battle.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Poll' }));
    expect(screen.getByRole('heading', { name: 'Start a poll' })).toBeTruthy();
  });

  it('shows multiple live polls inside the shared room feed', () => {
    renderChat({
      polls: [
        makePoll('poll-1', 'Which song should play next?', '2026-01-01T00:00:00.000Z'),
        makePoll('poll-2', 'Which artist should we queue?', '2026-01-01T00:00:01.000Z'),
      ],
    });

    expect(screen.getByText('Which song should play next?')).toBeTruthy();
    expect(screen.getByText('Which artist should we queue?')).toBeTruthy();
    expect(screen.getByText('0 messages · 2 polls · 0 battles')).toBeTruthy();
  });

  it('can start another poll while one is already live', () => {
    renderChat({
      polls: [
        makePoll('poll-1', 'Which song should play next?', '2026-01-01T00:00:00.000Z'),
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start a poll or battle' }));

    expect((screen.getByRole('button', { name: 'Poll' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
