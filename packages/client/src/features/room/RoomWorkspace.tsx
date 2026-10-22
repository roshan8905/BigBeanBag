import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AckResult, Room, RoomDetail, RoomMember } from '@bigbeanbag/shared';
import {
  ArrowLeft,
  Check,
  Copy,
  Globe2,
  Link2,
  Loader2,
  Lock,
  LockKeyhole,
  LogOut,
  Mic2,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { AddSongDialog } from '@/features/room/AddSongDialog';
import { ChatPanel } from '@/features/room/ChatPanel';
import { MembersPanel } from '@/features/room/MembersPanel';
import { PlaybackPanel } from '@/features/room/PlaybackPanel';
import { QueuePanel } from '@/features/room/QueuePanel';
import { RoomSettingsDialog } from '@/features/room/RoomSettingsDialog';
import { useRoomSync } from '@/features/room/useRoomSync';
import { InvitePanel } from '@/features/rooms/InvitePanel';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

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

export const RoomWorkspace = ({ detail }: { detail: RoomDetail }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { code } = detail.room;
  useRoomSync(code, true);

  const liveRoom = useAppSelector((state) => state.room.room);
  const me = useAppSelector((state) => state.room.me);
  const liveMembers = useAppSelector((state) => state.room.members);
  const presentIds = useAppSelector((state) => state.room.presentIds);
  const connection = useAppSelector((state) => state.room.connection);
  const socketError = useAppSelector((state) => state.room.error);
  const queue = useAppSelector((state) => state.queue.items);

  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const ownerMenuRef = useRef<HTMLDivElement>(null);

  const room = liveRoom ?? detail.room;
  const members = liveMembers.length ? liveMembers : detail.members;
  const role = me?.role ?? detail.role ?? 'MEMBER';
  const visibility = visibilityMeta[room.visibility];
  const isOwner = role === 'OWNER';
  const canRemove = role === 'OWNER' || role === 'HOST';
  const canControl = canRemove;
  const queuedCount = queue.filter((item) => item.status === 'QUEUED').length;
  const meMember = members.find((member) => member.userId === me?.userId);
  const isMuted = Boolean(meMember?.muted);
  const chatRestricted = room.chatRestricted && role === 'MEMBER';
  const canChat = !isMuted && !chatRestricted;
  const chatBlockedReason = isMuted
    ? 'You are muted by a host.'
    : chatRestricted
      ? 'Only hosts can chat right now.'
      : undefined;

  useEffect(() => {
    if (!ownerMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!ownerMenuRef.current?.contains(event.target as Node)) setOwnerMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOwnerMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ownerMenuOpen]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError('Clipboard is blocked. Type the code manually.');
    }
  };

  const toggleLock = async () => {
    setActionError('');
    setBusy('lock');

    const result = await new Promise<AckResult<Room>>((resolve) => {
      getSocket().emit('room:restrict', { locked: !room.locked }, resolve);
    });

    setBusy('');
    if (!result.ok) setActionError(result.message);
  };

  const removeRoom = async () => {
    if (!window.confirm('Delete this room for everyone? This cannot be undone.')) return;
    setActionError('');
    setBusy('delete');

    const result = await new Promise<AckResult<undefined>>((resolve) => {
      getSocket().emit('room:delete', resolve);
    });

    setBusy('');
    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    navigate('/rooms', { replace: true });
  };

  const changeRole = async (userId: string, action: 'promote' | 'demote') => {
    setActionError('');

    const result = await new Promise<AckResult<RoomMember>>((resolve) => {
      const socket = getSocket();
      if (action === 'promote') socket.emit('member:promote', { userId }, resolve);
      else socket.emit('member:demote', { userId }, resolve);
    });

    if (!result.ok) setActionError(result.message);
  };

  const moderate = async (userId: string, action: 'mute' | 'unmute' | 'kick' | 'ban') => {
    if (action === 'kick' || action === 'ban') {
      const label = action === 'ban' ? 'Ban' : 'Kick';
      if (!window.confirm(`${label} this person from the room?`)) return;
    }

    setActionError('');

    const result = await new Promise<AckResult<undefined>>((resolve) => {
      getSocket().emit('moderation:act', { userId, action }, resolve);
    });

    if (!result.ok) setActionError(result.message);
  };

  const leaveRoom = async () => {
    if (!window.confirm(`Leave ${room.name}? You can rejoin later with the room code.`)) return;

    setActionError('');
    setBusy('leave');

    const result = await new Promise<AckResult<undefined>>((resolve) => {
      getSocket().emit('room:exit', resolve);
    });

    setBusy('');
    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    dispatch(api.util.invalidateTags(['Rooms']));
    navigate('/rooms', { replace: true });
  };

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
            <p className="flex items-center gap-2 text-xs text-cream-500">
              Hosted by {detail.ownerName}
              <span className="inline-flex items-center gap-1">
                {connection === 'live' ? (
                  <Wifi size={11} className="text-mint" />
                ) : (
                  <WifiOff size={11} className="text-coral" />
                )}
                {connection === 'live' ? 'live' : connection === 'error' ? 'offline' : 'connecting'}
              </span>
            </p>
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
          {isOwner ? (
            <div ref={ownerMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setOwnerMenuOpen((open) => !open)}
                className="inline-flex size-[30px] items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cream-300 hover:bg-white/10 hover:text-cream-100"
                aria-label="Room actions"
                aria-haspopup="menu"
                aria-expanded={ownerMenuOpen}
                title="Room actions"
              >
                <MoreHorizontal size={16} />
              </button>

              {ownerMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-white/10 bg-ink-900 p-1.5 shadow-2xl shadow-black/40"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-cream-300 transition hover:bg-white/5 hover:text-cream-100"
                    onClick={() => {
                      setOwnerMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings size={14} /> Room settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-cream-300 transition hover:bg-white/5 hover:text-cream-100 disabled:opacity-50"
                    onClick={() => {
                      setOwnerMenuOpen(false);
                      void toggleLock();
                    }}
                    disabled={busy === 'lock'}
                  >
                    {busy === 'lock' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : room.locked ? (
                      <Unlock size={14} />
                    ) : (
                      <Lock size={14} />
                    )}
                    {room.locked ? 'Unlock room' : 'Lock room'}
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-coral transition hover:bg-coral/10 disabled:opacity-50"
                    onClick={() => {
                      setOwnerMenuOpen(false);
                      void removeRoom();
                    }}
                    disabled={busy === 'delete'}
                  >
                    <Trash2 size={14} /> {busy === 'delete' ? 'Deleting…' : 'Delete room'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-cream-300">
            <visibility.icon size={13} /> {visibility.label}
          </span>
          {room.locked ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-coral/15 px-2.5 py-1.5 text-xs text-coral">
              <LockKeyhole size={13} /> Locked
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${roleStyles[role]}`}
          >
            {role === 'OWNER' ? <ShieldCheck size={13} /> : <Mic2 size={13} />} {role.toLowerCase()}
          </span>
        </div>
      </header>

      {actionError || socketError ? (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-sm text-coral">
          {actionError || socketError}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="flex flex-col gap-4">
          <PlaybackPanel canControl={canControl} />
          <QueuePanel
            canAdd={!room.addRestricted || canControl}
            canRemove={canRemove}
            onAdd={() => setAddOpen(true)}
          />
        </div>

        <aside className="space-y-4">
          <section className="grid grid-cols-3 gap-2 text-center text-xs text-cream-400">
            <div className="card p-3">
              <p className="text-lg font-semibold text-cream-100">
                {presentIds.length || members.length}
              </p>
              listening
            </div>
            <div className="card p-3">
              <p className="text-lg font-semibold text-cream-100">{queuedCount}</p>
              queued
            </div>
            <div className="card p-3">
              <p className="text-lg font-semibold text-cream-100">{room.autoplay ? 'On' : 'Off'}</p>
              autoplay
            </div>
          </section>

          <ChatPanel
            meId={me?.userId ?? ''}
            canChat={canChat}
            canControl={canControl}
            blockedReason={chatBlockedReason}
          />

          <MembersPanel
            members={members}
            presentIds={presentIds}
            meId={me?.userId ?? ''}
            myRole={role}
            onRoleChange={(userId, action) => void changeRole(userId, action)}
            onModerate={(userId, action) => void moderate(userId, action)}
          />

          {!isOwner ? (
            <button
              type="button"
              className="btn-ghost w-full justify-center text-xs text-cream-400"
              onClick={() => void leaveRoom()}
              disabled={busy === 'leave'}
            >
              {busy === 'leave' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <LogOut size={14} />
              )}
              {busy === 'leave' ? 'Leaving…' : 'Leave room'}
            </button>
          ) : null}

          {isOwner ? <InvitePanel code={code} /> : null}
        </aside>
      </div>

      <AddSongDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {isOwner && settingsOpen ? (
        <RoomSettingsDialog open onClose={() => setSettingsOpen(false)} room={room} />
      ) : null}
    </main>
  );
};
