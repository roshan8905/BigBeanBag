import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { RoomDetail } from '@bigbeanbag/shared';
import {
  ArrowLeft,
  Check,
  Copy,
  Globe2,
  Link2,
  Lock,
  LockKeyhole,
  Mic2,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { Loader } from '@/components/Loader';
import { InvitePanel } from '@/features/rooms/InvitePanel';
import { apiErrorMessage } from '@/lib/errors';
import {
  useDeleteRoomMutation,
  useGetRoomQuery,
  useJoinRoomMutation,
  useSetRoomLockedMutation,
} from '@/lib/api';

const visibilityMeta = {
  PUBLIC: { label: 'Public', icon: Globe2 },
  UNLISTED: { label: 'Unlisted', icon: Link2 },
  PRIVATE: { label: 'Private', icon: Lock },
};

const roleStyles = {
  OWNER: 'bg-bean-400/20 text-bean-200',
  HOST: 'bg-mint/15 text-mint',
  MEMBER: 'bg-white/10 text-cream-300',
};

export const RoomPage = () => {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetRoomQuery(code, { skip: !code });
  const [joinRoom, { isLoading: joining }] = useJoinRoomMutation();
  const [setLocked, { isLoading: locking }] = useSetRoomLockedMutation();
  const [deleteRoom, { isLoading: deleting }] = useDeleteRoomMutation();
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');

  const handleJoin = async () => {
    setActionError('');
    try {
      await joinRoom({ code }).unwrap();
    } catch (cause) {
      setActionError(apiErrorMessage(cause, 'Could not join this room'));
    }
  };

  const handleLock = async (detail: RoomDetail) => {
    setActionError('');
    try {
      await setLocked({ code, locked: !detail.room.locked }).unwrap();
    } catch (cause) {
      setActionError(apiErrorMessage(cause, 'Could not update the lock'));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this room for everyone? This cannot be undone.')) return;
    setActionError('');
    try {
      await deleteRoom(code).unwrap();
      navigate('/rooms');
    } catch (cause) {
      setActionError(apiErrorMessage(cause, 'Could not delete the room'));
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError('Clipboard is blocked. Type the code manually.');
    }
  };

  if (isLoading) return <Loader label="Opening the room" />;

  if (error || !data) {
    return (
      <main className="grid min-h-screen place-items-center px-5">
        <div className="card max-w-md p-7 text-center">
          <h1 className="font-display text-xl font-semibold">Cannot open this room</h1>
          <p className="mt-2 text-sm text-cream-400">
            {apiErrorMessage(error, 'The room may be private, deleted, or the code is wrong.')}
          </p>
          <Link to="/rooms" className="btn-primary mt-5">
            Back to rooms
          </Link>
        </div>
      </main>
    );
  }

  const { room, role, members, ownerName } = data;
  const visibility = visibilityMeta[room.visibility];
  const isOwner = role === 'OWNER';
  const isMember = role !== null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-6 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/rooms"
            className="rounded-lg p-2 text-cream-400 hover:bg-white/5 hover:text-cream-100"
            aria-label="Back to rooms"
          >
            <ArrowLeft size={18} />
          </Link>
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
          {role ? (
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${roleStyles[role]}`}>
              {role === 'OWNER' ? <ShieldCheck size={13} /> : <Mic2 size={13} />} {role.toLowerCase()}
            </span>
          ) : null}
        </div>
      </header>

      {actionError ? (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
          {actionError}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex min-h-[22rem] flex-col items-center justify-center p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-bean-400/15 text-bean-300">
            <Mic2 size={26} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold">
            {isMember ? 'You are in the room' : 'Peek inside'}
          </h2>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-cream-400">
            {isMember
              ? 'The shared queue, voting, and synced player land here next. For now, share the invite and get the crew in.'
              : 'Join to see the queue, vote on tracks, and chat with the room.'}
          </p>

          {!isMember ? (
            <button type="button" className="btn-primary mt-5" onClick={() => void handleJoin()} disabled={joining}>
              {joining ? 'Joining…' : 'Join room'}
            </button>
          ) : null}

          {isMember ? (
            <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2 text-xs text-cream-400">
              <div className="rounded-xl border border-white/5 bg-ink-900/60 p-3">
                <p className="text-base font-semibold text-cream-100">{room.memberCount}</p>
                listening
              </div>
              <div className="rounded-xl border border-white/5 bg-ink-900/60 p-3">
                <p className="text-base font-semibold text-cream-100">0</p>
                in queue
              </div>
              <div className="rounded-xl border border-white/5 bg-ink-900/60 p-3">
                <p className="text-base font-semibold text-cream-100">0</p>
                votes
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          {isOwner ? <InvitePanel code={code} /> : null}

          {isMember ? (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={15} className="text-bean-300" /> People
                </h2>
                <span className="text-xs text-cream-500">{members.length}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {members.map((member) => (
                  <li key={member.userId} className="flex items-center gap-2.5">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-7 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full bg-white/10 text-[11px] font-semibold">
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{member.name}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${roleStyles[member.role]}`}>
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isOwner ? (
            <section className="card space-y-2 p-5">
              <h2 className="text-sm font-semibold">Owner controls</h2>
              <button
                type="button"
                className="btn-ghost w-full justify-start text-xs"
                onClick={() => void handleLock(data)}
                disabled={locking}
              >
                {room.locked ? <Unlock size={14} /> : <Lock size={14} />}
                {room.locked ? 'Unlock room' : 'Lock room'}
              </button>
              <button
                type="button"
                className="btn-ghost w-full justify-start text-xs text-coral"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete room'}
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
};
