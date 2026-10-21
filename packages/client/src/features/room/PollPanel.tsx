import { useState } from 'react';
import type { Poll } from '@bigbeanbag/shared';
import { BarChart3, Check, Loader2, Plus, Vote, X } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useAppSelector } from '@/app/hooks';
import { getSocket } from '@/lib/socket';

const CreatePollDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const cleaned = options.map((option) => option.trim()).filter(Boolean);
    if (question.trim().length < 3) {
      setError('Ask a question with at least three characters.');
      return;
    }
    if (cleaned.length < 2) {
      setError('Add at least two options.');
      return;
    }

    const socket = getSocket();
    if (!socket.connected) {
      setError('Still connecting. Try again in a second.');
      return;
    }

    setSaving(true);

    const result = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      socket.emit('poll:create', { question: question.trim(), options: cleaned }, resolve);
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.message ?? 'Could not start the poll');
      return;
    }

    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Start a poll"
      description="Everyone in the room gets one vote. Only one poll runs at a time."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        <div>
          <label htmlFor="poll-question" className="label">
            Question
          </label>
          <input
            id="poll-question"
            className="input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Which track should play next?"
            maxLength={140}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <span className="label">Options</span>
          {options.map((option, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="input"
                value={option}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((entry, position) =>
                      position === index ? event.target.value : entry,
                    ),
                  )
                }
                placeholder={`Option ${index + 1}`}
                maxLength={60}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    setOptions((current) => current.filter((_, position) => position !== index))
                  }
                  className="rounded-lg px-2 text-cream-500 hover:bg-white/5 hover:text-coral"
                  aria-label={`Remove option ${index + 1}`}
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          ))}

          {options.length < 6 ? (
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setOptions((current) => [...current, ''])}
            >
              <Plus size={13} /> Add option
            </button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Start poll'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const PollBody = ({
  poll,
  meId,
  canModerate,
}: {
  poll: Poll;
  meId: string;
  canModerate: boolean;
}) => {
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const open = poll.status === 'OPEN';
  const total = poll.totalVotes;
  const canClose = open && (poll.createdBy === meId || canModerate);

  const vote = (optionId: string) => {
    if (!open || voting) return;
    setVoting(true);
    setError('');

    getSocket().emit('poll:vote', { pollId: poll.id, optionId }, (result) => {
      setVoting(false);
      if (!result.ok) setError(result.message);
    });
  };

  const close = () => {
    if (!canClose || closing) return;
    setClosing(true);
    setError('');

    getSocket().emit('poll:close', { pollId: poll.id }, (result) => {
      setClosing(false);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{poll.question}</p>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            open ? 'bg-mint/15 text-mint' : 'bg-white/10 text-cream-400'
          }`}
        >
          {open ? 'live' : 'closed'}
        </span>
      </div>

      {poll.options.map((option) => {
        const pct = total ? Math.round((option.votes / total) * 100) : 0;
        const mine = poll.myVoteOptionId === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => vote(option.id)}
            disabled={!open || voting}
            aria-pressed={mine}
            className={`relative block w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left text-xs transition disabled:cursor-default ${
              mine
                ? 'border-bean-400/50 bg-bean-400/10'
                : 'border-white/10 bg-ink-900/40 hover:border-white/20'
            }`}
          >
            <span
              className="absolute inset-y-0 left-0 bg-bean-400/10"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <span className="relative flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {mine ? <Check size={12} className="shrink-0 text-bean-300" /> : null}
                <span className="truncate">{option.label}</span>
              </span>
              <span className="shrink-0 text-cream-400">
                {option.votes} · {pct}%
              </span>
            </span>
          </button>
        );
      })}

      <div className="flex items-center justify-between text-[11px] text-cream-500">
        <span>
          {total} {total === 1 ? 'vote' : 'votes'}
          {open ? ' · tap your pick again to clear' : ''}
        </span>
        {canClose ? (
          <button
            type="button"
            onClick={close}
            disabled={closing}
            className="rounded-md px-1.5 py-0.5 text-[11px] text-coral hover:bg-white/5"
          >
            {closing ? 'Closing…' : 'Close poll'}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-[11px] text-coral">{error}</p> : null}
    </div>
  );
};

export const PollPanel = ({ meId, canModerate }: { meId: string; canModerate: boolean }) => {
  const poll = useAppSelector((state) => state.poll.poll);
  const [createOpen, setCreateOpen] = useState(false);
  const canStart = !poll || poll.status === 'CLOSED';

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 size={15} className="text-bean-300" /> Poll
        </h2>
        {canStart ? (
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-[11px]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={13} /> New poll
          </button>
        ) : null}
      </div>

      {poll ? (
        <PollBody poll={poll} meId={meId} canModerate={canModerate} />
      ) : (
        <div className="mt-3 flex flex-col items-center justify-center py-5 text-center">
          <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-cream-500">
            <Vote size={17} />
          </span>
          <p className="mt-2 text-xs text-cream-400">No poll running.</p>
          <p className="text-[11px] text-cream-500">Settle the next pick with a room vote.</p>
        </div>
      )}

      <CreatePollDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </section>
  );
};
