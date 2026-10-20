import { useState } from 'react';
import type { RoomMember, Role } from '@bigbeanbag/shared';
import { canManageRoles, canModerate } from '@bigbeanbag/shared';
import { Ban, ChevronDown, MicOff, MoreHorizontal, Shield, UserMinus, Users } from 'lucide-react';

const roleStyles = {
  OWNER: 'bg-bean-400/20 text-bean-200',
  HOST: 'bg-mint/15 text-mint',
  MEMBER: 'bg-white/10 text-cream-300',
};

const actionClass =
  'rounded-lg border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-cream-300 hover:bg-white/5';

export const MembersPanel = ({
  members,
  presentIds,
  meId,
  myRole,
  onRoleChange,
  onModerate,
}: {
  members: RoomMember[];
  presentIds: string[];
  meId: string;
  myRole: Role;
  onRoleChange: (userId: string, action: 'promote' | 'demote') => void;
  onModerate: (userId: string, action: 'mute' | 'unmute' | 'kick' | 'ban') => void;
}) => {
  const [openId, setOpenId] = useState('');

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users size={15} className="text-bean-300" /> People
        </h2>
        <span className="text-xs text-cream-500">
          {presentIds.length}/{members.length} here
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {members.map((member) => {
          const online = presentIds.includes(member.userId);
          const canChangeRole =
            canManageRoles(myRole) && member.role !== 'OWNER' && member.userId !== meId;
          const canAct = canModerate(myRole, member.role) && member.userId !== meId;
          const hasActions = canChangeRole || canAct;
          const open = openId === member.userId;

          return (
            <li key={member.userId} className="rounded-lg">
              <div className="flex items-center gap-2.5">
                <span className="relative shrink-0">
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
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-ink-900 ${
                      online ? 'bg-mint' : 'bg-cream-600'
                    }`}
                    title={online ? 'Listening now' : 'Offline'}
                  />
                </span>

                <span className="min-w-0 flex-1 truncate text-sm">
                  {member.name}
                  {member.userId === meId ? (
                    <span className="ml-1 text-[11px] text-cream-500">you</span>
                  ) : null}
                </span>

                {member.muted ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase text-coral">
                    <MicOff size={10} /> muted
                  </span>
                ) : null}
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${roleStyles[member.role]}`}>
                  {member.role}
                </span>

                {hasActions ? (
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? '' : member.userId)}
                    aria-label={`Manage ${member.name}`}
                    aria-expanded={open}
                    className="rounded-md p-1 text-cream-500 hover:bg-white/5 hover:text-cream-200"
                  >
                    {open ? <ChevronDown size={15} /> : <MoreHorizontal size={15} />}
                  </button>
                ) : null}
              </div>

              {open ? (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                  {canChangeRole ? (
                    <button
                      type="button"
                      className={actionClass}
                      onClick={() => {
                        setOpenId('');
                        onRoleChange(member.userId, member.role === 'HOST' ? 'demote' : 'promote');
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Shield size={12} />
                        {member.role === 'HOST' ? 'Demote to member' : 'Make host'}
                      </span>
                    </button>
                  ) : null}

                  {canAct ? (
                    <>
                      <button
                        type="button"
                        className={actionClass}
                        onClick={() => {
                          setOpenId('');
                          onModerate(member.userId, member.muted ? 'unmute' : 'mute');
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <MicOff size={12} /> {member.muted ? 'Unmute' : 'Mute'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={actionClass}
                        onClick={() => {
                          setOpenId('');
                          onModerate(member.userId, 'kick');
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <UserMinus size={12} /> Kick
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`${actionClass} text-coral`}
                        onClick={() => {
                          setOpenId('');
                          onModerate(member.userId, 'ban');
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Ban size={12} /> Ban
                        </span>
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {myRole === 'MEMBER' ? (
        <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-cream-500">
          Hosts can mute, kick, or ban members. Only the owner changes roles.
        </p>
      ) : null}
    </section>
  );
};
