import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomDetail } from '@bigbeanbag/shared';
import { ArrowLeft, Check, Copy, Globe2, Link2, Lock, LockKeyhole, Mic2, Users } from 'lucide-react';
import { apiErrorMessage } from '@/lib/errors';
import { useJoinRoomMutation } from '@/lib/api';

const visibilityMeta = {
  PUBLIC: { label: 'Public', icon: Globe2 },
  UNLISTED: { label: 'Unlisted', icon: Link2 },
  PRIVATE: { label: 'Private', icon: Lock },
};

export const RoomPreview = ({ detail }: { detail: RoomDetail }) => {
  const { room, ownerName } = detail;
  const navigate = useNavigate();
  const [joinRoom, { isLoading }] = useJoinRoomMutation();
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const visibility = visibilityMeta[room.visibility];

  const join = async () => {
    setError('');
    try {
      const joined = await joinRoom({ code: room.code }).unwrap();
      navigate(`/rooms/${joined.room.code}`, { replace: true });
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not join this room'));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Clipboard is blocked. Type the code manually.');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/rooms')}
            className="rounded-lg p-2 text-cream-400 hover:bg-white/5 hover:text-cream-100"
            aria-label="Back to rooms"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold">{room.name}</h1>
            <p className="text-xs text-cream-500">Hosted by {ownerName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyCode()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs tracking-[0.25em] text-cream-200 hover:bg-white/10"
            title="Copy room code"
          >
            {room.code}
            {copied ? <Check size={13} className="text-mint" /> : <Copy size={13} />}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-cream-300">
            <visibility.icon size={13} /> {visibility.label}
          </span>
          {room.locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral/15 px-2.5 py-1.5 text-xs text-coral">
              <LockKeyhole size={13} /> Locked
            </span>
          ) : null}
        </div>
      </header>

      <section className="card flex flex-1 flex-col items-center justify-center p-10 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-bean-400/15 text-bean-300">
          <Mic2 size={26} />
        </span>
        <h2 className="mt-4 font-display text-2xl font-semibold">Peek inside</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-cream-400">
          Join to see the live queue, vote on what plays next, and hang out with the room.
        </p>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-cream-500">
          <Users size={13} /> {room.memberCount} listening
        </div>

        {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

        <button type="button" className="btn-primary mt-5" onClick={() => void join()} disabled={isLoading}>
          {isLoading ? 'Joining…' : 'Join room'}
        </button>
      </section>
    </main>
  );
};
