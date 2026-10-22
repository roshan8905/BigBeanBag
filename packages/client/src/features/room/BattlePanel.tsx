import { useEffect, useState } from 'react';
import type { Battle, QueueItem } from '@bigbeanbag/shared';
import { Crown, Loader2, Swords, Timer } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { getSocket } from '@/lib/socket';

const remainingLabel = (endsAt: string, now: number) => {
  const seconds = Math.max(Math.ceil((new Date(endsAt).getTime() - now) / 1000), 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export const CreateBattleDialog = ({
  onClose,
  items,
}: {
  onClose: () => void;
  items: QueueItem[];
}) => {
  const [itemAId, setItemAId] = useState(items[0]?.id ?? '');
  const [itemBId, setItemBId] = useState(items[1]?.id ?? '');
  const [durationSec, setDurationSec] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!itemAId || !itemBId || itemAId === itemBId) {
      setError('Pick two different queued songs.');
      return;
    }

    const socket = getSocket();
    if (!socket.connected) {
      setError('Still connecting. Try again in a second.');
      return;
    }

    setSaving(true);

    const result = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      socket.emit('battle:create', { itemAId, itemBId, durationSec }, resolve);
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.message ?? 'Could not start the battle');
      return;
    }

    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Start a song battle"
      description="Pick two queued tracks. The room votes, and the higher-vote track wins."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        {[
          { label: 'Song A', value: itemAId, set: setItemAId },
          { label: 'Song B', value: itemBId, set: setItemBId },
        ].map((field) => (
          <div key={field.label}>
            <label htmlFor={`battle-${field.label}`} className="label">
              {field.label}
            </label>
            <select
              id={`battle-${field.label}`}
              className="input"
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
            >
              <option value="">Pick a queued song</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div>
          <label htmlFor="battle-duration" className="label">
            Battle length
          </label>
          <select
            id="battle-duration"
            className="input"
            value={durationSec}
            onChange={(event) => setDurationSec(Number(event.target.value))}
          >
            {[30, 45, 60, 90, 120].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Start battle'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const BattleBody = ({ battle }: { battle: Battle }) => {
  const [now, setNow] = useState(() => Date.now());
  const [voting, setVoting] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (battle.status !== 'OPEN') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [battle.status]);

  const open = battle.status === 'OPEN' && new Date(battle.endsAt).getTime() > now;
  const total = battle.entries.reduce((sum, entry) => sum + entry.votes, 0);
  const winner = battle.entries.find((entry) => entry.itemId === battle.winnerItemId);

  const vote = (itemId: string) => {
    if (!open || voting) return;
    setVoting(itemId);
    setError('');

    getSocket().emit('battle:vote', { battleId: battle.id, itemId }, (result) => {
      setVoting('');
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-cream-500">
        <span className="inline-flex items-center gap-1">
          <Timer size={12} />
          {open ? remainingLabel(battle.endsAt, now) : 'Finished'}
        </span>
        <span>{total} votes</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {battle.entries.map((entry) => {
          const mine = battle.myVoteItemId === entry.itemId;
          const isWinner = battle.winnerItemId === entry.itemId;
          const pct = total ? Math.round((entry.votes / total) * 100) : 0;

          return (
            <button
              key={entry.itemId}
              type="button"
              onClick={() => vote(entry.itemId)}
              disabled={!open || Boolean(voting)}
              className={`relative overflow-hidden rounded-xl border p-1.5 text-left transition disabled:cursor-default ${
                isWinner
                  ? 'border-mint/50 bg-mint/10'
                  : mine
                    ? 'border-bean-400/50 bg-bean-400/10'
                    : 'border-white/10 bg-ink-900/40 hover:border-white/20'
              }`}
            >
              <img
                src={entry.thumbnail}
                alt=""
                loading="lazy"
                className="aspect-video w-full rounded-lg object-cover"
              />
              <div className="mt-1.5 px-0.5">
                <p className="truncate text-xs font-medium">{entry.title}</p>
                <p className="truncate text-[10px] text-cream-500">{entry.artist ?? 'YouTube'}</p>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-cream-400">{entry.votes} votes</span>
                  {isWinner ? (
                    <span className="inline-flex items-center gap-0.5 font-semibold text-mint">
                      <Crown size={10} /> winner
                    </span>
                  ) : mine ? (
                    <span className="text-bean-300">your pick</span>
                  ) : (
                    <span className="text-cream-500">{pct}%</span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${isWinner ? 'bg-mint' : 'bg-bean-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {voting === entry.itemId ? (
                <span className="absolute inset-0 grid place-items-center bg-ink-950/60">
                  <Loader2 size={16} className="animate-spin text-bean-300" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {winner && battle.status === 'CLOSED' ? (
        <p className="mt-2 text-[11px] text-mint">
          {winner.title} won the battle with {winner.votes} votes.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-[11px] text-coral">{error}</p> : null}
    </div>
  );
};

export const BattleActivity = ({ battle }: { battle: Battle }) => {
  const open = battle.status === 'OPEN';

  return (
    <section className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-bean-200">
          <Swords size={12} /> Battle
        </h3>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            open ? 'bg-mint/15 text-mint' : 'bg-white/10 text-cream-400'
          }`}
        >
          {open ? 'live' : 'closed'}
        </span>
      </div>
      <BattleBody battle={battle} />
    </section>
  );
};
