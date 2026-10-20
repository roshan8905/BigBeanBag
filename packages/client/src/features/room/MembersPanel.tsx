import type { RoomMember } from '@bigbeanbag/shared';
import { Users } from 'lucide-react';

const roleStyles = {
  OWNER: 'bg-bean-400/20 text-bean-200',
  HOST: 'bg-mint/15 text-mint',
  MEMBER: 'bg-white/10 text-cream-300',
};

export const MembersPanel = ({
  members,
  presentIds,
  meId,
}: {
  members: RoomMember[];
  presentIds: string[];
  meId: string;
}) => (
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

        return (
          <li key={member.userId} className="flex items-center gap-2.5">
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
              {member.userId === meId ? <span className="ml-1 text-[11px] text-cream-500">you</span> : null}
            </span>
            {member.muted ? (
              <span className="text-[10px] font-semibold uppercase text-coral">muted</span>
            ) : null}
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${roleStyles[member.role]}`}>
              {member.role}
            </span>
          </li>
        );
      })}
    </ul>
  </section>
);
