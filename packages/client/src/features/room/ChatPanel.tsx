import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS } from '@bigbeanbag/shared';
import type { Battle, ChatMessage, Poll } from '@bigbeanbag/shared';
import { BarChart3, Loader2, MessageCircle, Plus, Send, Swords, X } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { getSocket } from '@/lib/socket';
import { BattleActivity, CreateBattleDialog } from '@/features/room/BattlePanel';
import { CreatePollDialog, PollActivity } from '@/features/room/PollPanel';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

type Activity =
  | { kind: 'chat'; id: string; at: number; message: ChatMessage }
  | { kind: 'poll'; id: string; at: number; poll: Poll }
  | { kind: 'battle'; id: string; at: number; battle: Battle };

export const ChatPanel = ({
  meId,
  canChat,
  canControl,
  blockedReason,
}: {
  meId: string;
  canChat: boolean;
  canControl: boolean;
  blockedReason?: string;
}) => {
  const messages = useAppSelector((state) => state.chat.messages);
  const reactions = useAppSelector((state) => state.chat.reactions);
  const polls = useAppSelector((state) => state.poll.polls);
  const battles = useAppSelector((state) => state.battle.battles);
  const queueItems = useAppSelector((state) => state.queue.items);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reacting, setReacting] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [battleDialogOpen, setBattleDialogOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  const queued = queueItems.filter((item) => item.status === 'QUEUED');
  const activeBattle = battles.find((battle) => battle.status === 'OPEN');
  const battleRunning = Boolean(activeBattle);
  const battleReason = !canControl
    ? 'Only the owner or a host can start a battle.'
    : battleRunning
      ? 'A battle is already running.'
      : queued.length < 2
        ? 'Queue at least two songs first.'
        : '';
  const canStartBattle = battleReason === '';

  const activities: Activity[] = [
    ...messages.map((message) => ({
      kind: 'chat' as const,
      id: `chat-${message.id}`,
      at: new Date(message.createdAt).getTime(),
      message,
    })),
    ...polls.map((poll) => ({
      kind: 'poll' as const,
      id: `poll-${poll.id}`,
      at: new Date(poll.createdAt).getTime(),
      poll,
    })),
    ...battles.map((battle) => ({
      kind: 'battle' as const,
      id: `battle-${battle.id}`,
      at: new Date(battle.createdAt).getTime(),
      battle,
    })),
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [activities.length]);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const send = () => {
    const text = body.trim();
    if (!text || !canChat || sending) return;

    if (!getSocket().connected) {
      setError('Still reconnecting. Try again in a second.');
      return;
    }

    setSending(true);
    setError('');

    getSocket().emit('chat:send', { body: text }, (result) => {
      setSending(false);
      if (result.ok) setBody('');
      else setError(result.message);
    });
  };

  const react = (emoji: string) => {
    if (!canChat || reacting) return;
    setReacting(emoji);
    setError('');

    getSocket().emit('reaction:send', { emoji }, (result) => {
      setReacting('');
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <section className="card flex h-[32rem] flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle size={15} className="text-bean-300" /> Room chat
        </h2>
        <span className="text-right text-[11px] text-cream-500">
          {messages.length} messages · {polls.length} polls · {battles.length} battles
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {REACTION_EMOJIS.map((emoji) => {
          const count = reactions.find((entry) => entry.emoji === emoji)?.count ?? 0;

          return (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              disabled={!canChat || Boolean(reacting)}
              className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-sm transition ${
                count
                  ? 'border-bean-400/30 bg-bean-400/10'
                  : 'border-white/10 bg-ink-900/50 hover:bg-white/5'
              } disabled:cursor-not-allowed disabled:opacity-40`}
              aria-label={`React with ${emoji}`}
            >
              <span>{emoji}</span>
              {count ? <span className="text-[10px] font-semibold text-cream-300">{count}</span> : null}
              {reacting === emoji ? <Loader2 size={9} className="animate-spin text-cream-400" /> : null}
            </button>
          );
        })}
      </div>

      <div ref={listRef} className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
        {activities.length ? (
          activities.map((activity) => {
            if (activity.kind === 'poll') {
              return (
                <PollActivity
                  key={activity.id}
                  poll={activity.poll}
                  meId={meId}
                  canModerate={canControl}
                />
              );
            }

            if (activity.kind === 'battle') {
              return <BattleActivity key={activity.id} battle={activity.battle} />;
            }

            const { message } = activity;
            const own = message.userId === meId;

            return (
              <div key={activity.id} className={`flex gap-2 ${own ? 'flex-row-reverse' : ''}`}>
                {message.avatarUrl ? (
                  <img
                    src={message.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="mt-0.5 size-6 shrink-0 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-semibold">
                    {message.name.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <div
                  className={`max-w-[82%] rounded-xl px-2.5 py-1.5 ${
                    own ? 'bg-bean-400/15' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-cream-500">
                    <span className={own ? 'font-semibold text-bean-200' : 'font-semibold text-cream-300'}>
                      {message.name}
                    </span>
                    <span>{clock(message.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug">{message.body}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-cream-400">No activity yet</p>
            <p className="mt-0.5 text-[11px] text-cream-500">
              Say hi, start a poll, or battle two songs.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3">
        {error ? <p className="mb-1.5 text-[11px] text-coral">{error}</p> : null}

        <div ref={composerRef} className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-ink-900/60 text-cream-300 transition hover:bg-white/5 hover:text-cream-100"
            aria-label={menuOpen ? 'Close activity menu' : 'Start a poll or battle'}
            aria-expanded={menuOpen}
            title={menuOpen ? 'Close activity menu' : 'Start a poll or battle'}
          >
            {menuOpen ? <X size={16} /> : <Plus size={16} />}
          </button>

          {menuOpen ? (
            <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-white/10 bg-ink-900 p-1.5 shadow-xl shadow-black/40">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPollDialogOpen(true);
                    setMenuOpen(false);
                  }}
                  title="Start a poll"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-cream-200 transition hover:bg-white/10"
                >
                  <BarChart3 size={13} /> Poll
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBattleDialogOpen(true);
                    setMenuOpen(false);
                  }}
                  disabled={!canStartBattle}
                  title={battleReason || 'Start a battle'}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-cream-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Swords size={13} /> Battle
                </button>
              </div>
              {battleReason ? (
                <p className="px-1.5 pb-0.5 pt-1 text-[10px] leading-snug text-cream-500">
                  {battleReason}
                </p>
              ) : null}
            </div>
          ) : null}

          {canChat ? (
            <>
              <input
                className="input min-w-0 flex-1 py-2 text-sm"
                value={body}
                maxLength={500}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Message the room"
                aria-label="Chat message"
              />
              <button
                type="button"
                className="btn-primary shrink-0 px-3"
                onClick={send}
                disabled={sending || !body.trim()}
                aria-label="Send message"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </>
          ) : (
            <p className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-900/50 px-2.5 py-2 text-[11px] text-cream-500">
              {blockedReason ?? 'You cannot chat right now.'}
            </p>
          )}
        </div>
      </div>

      {pollDialogOpen ? <CreatePollDialog open onClose={() => setPollDialogOpen(false)} /> : null}
      {battleDialogOpen ? (
        <CreateBattleDialog onClose={() => setBattleDialogOpen(false)} items={queued} />
      ) : null}
    </section>
  );
};
