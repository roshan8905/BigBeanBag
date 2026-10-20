import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS } from '@bigbeanbag/shared';
import { Loader2, MessageCircle, Send } from 'lucide-react';
import { useAppSelector } from '@/app/hooks';
import { getSocket } from '@/lib/socket';

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const ChatPanel = ({
  meId,
  canChat,
  blockedReason,
}: {
  meId: string;
  canChat: boolean;
  blockedReason?: string;
}) => {
  const messages = useAppSelector((state) => state.chat.messages);
  const reactions = useAppSelector((state) => state.chat.reactions);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [reacting, setReacting] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

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
    <section className="card flex h-[26rem] flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle size={15} className="text-bean-300" /> Room chat
        </h2>
        <span className="text-[11px] text-cream-500">{messages.length} messages</span>
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
        {messages.length ? (
          messages.map((message) => {
            const own = message.userId === meId;

            return (
              <div key={message.id} className={`flex gap-2 ${own ? 'flex-row-reverse' : ''}`}>
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
            <p className="text-sm text-cream-400">No messages yet</p>
            <p className="mt-0.5 text-[11px] text-cream-500">Say hi or drop a reaction.</p>
          </div>
        )}
      </div>

      <div className="mt-3">
        {error ? <p className="mb-1.5 text-[11px] text-coral">{error}</p> : null}

        {canChat ? (
          <div className="flex gap-2">
            <input
              className="input py-2 text-sm"
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
          </div>
        ) : (
          <p className="rounded-lg border border-white/10 bg-ink-900/50 px-2.5 py-2 text-[11px] text-cream-500">
            {blockedReason ?? 'You cannot chat right now.'}
          </p>
        )}
      </div>
    </section>
  );
};
