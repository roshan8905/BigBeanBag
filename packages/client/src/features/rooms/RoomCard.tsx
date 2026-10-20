import { Link } from 'react-router-dom';
import type { RoomSummary } from '@bigbeanbag/shared';
import { Globe2, Link2, Lock, LockKeyhole, Users } from 'lucide-react';

const visibilityIcon = {
  PUBLIC: Globe2,
  UNLISTED: Link2,
  PRIVATE: Lock,
};

const roleLabel = {
  OWNER: 'Owner',
  HOST: 'Host',
  MEMBER: 'Member',
};

export const RoomCard = ({ room, action }: { room: RoomSummary; action?: 'join' }) => {
  const Icon = visibilityIcon[room.visibility];

  return (
    <article className="card group flex flex-col gap-3 p-4 transition hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">{room.name}</h3>
          <p className="mt-0.5 text-xs text-cream-500">by {room.ownerName}</p>
        </div>
        <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] tracking-widest text-cream-300">
          {room.code}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-cream-400">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
          <Icon size={12} /> {room.visibility.toLowerCase()}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1">
          <Users size={12} /> {room.memberCount}
        </span>
        {room.locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-coral/15 px-2 py-1 text-coral">
            <LockKeyhole size={12} /> locked
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {room.role ? (
          <span className="rounded-md bg-bean-400/15 px-2 py-1 text-[11px] font-semibold text-bean-200">
            {roleLabel[room.role]}
          </span>
        ) : (
          <span className="text-[11px] text-cream-500">Not joined</span>
        )}
        <Link
          to={action === 'join' ? `/rooms/${room.code}` : `/rooms/${room.code}`}
          className="text-xs font-semibold text-bean-300 hover:text-bean-200"
        >
          {action === 'join' ? 'Join' : 'Open'} →
        </Link>
      </div>
    </article>
  );
};
