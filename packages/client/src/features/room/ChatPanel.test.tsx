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

const renderChat = ({ canControl = false, poll = null }: { canControl?: boolean; poll?: Poll | null } = {}) => {
  const store = configureStore({
    reducer: {
      chat: chatReducer,
      poll: pollReducer,
      battle: battleReducer,
      queue: queueReducer,
    },
    preloadedState: {
      chat: { messages: [], reactions: [] },
      poll: { poll },
      battle: { battle: null, ended: null },
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

    expect(screen.getByRole('button', { name: 'Poll' })).toBeTruthy();
    const battle = screen.getByRole('button', { name: 'Battle' }) as HTMLButtonElement;
    expect(battle.disabled).toBe(true);
    expect(screen.getByText('Only the owner or a host can start a battle.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Poll' }));
    expect(screen.getByRole('heading', { name: 'Start a poll' })).toBeTruthy();
  });

  it('shows the active poll inside the chat', () => {
    renderChat({
      poll: {
        id: 'poll-1',
        question: 'Which song should play next?',
        status: 'OPEN',
        createdBy: 'host',
        options: [
          { id: 'a', label: 'First song', votes: 1 },
          { id: 'b', label: 'Second song', votes: 0 },
        ],
        totalVotes: 1,
        myVoteOptionId: null,
        createdAt: new Date().toISOString(),
      },
    });

    expect(screen.getByText('Which song should play next?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /First song/ })).toBeTruthy();
  });
});
