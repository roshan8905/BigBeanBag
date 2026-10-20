import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, DoorOpen, Plus, Users, X } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Loader } from '@/components/Loader';
import { CreateRoomDialog } from '@/features/rooms/CreateRoomDialog';
import { JoinRoomDialog } from '@/features/rooms/JoinRoomDialog';
import { RoomCard } from '@/features/rooms/RoomCard';
import { apiErrorMessage } from '@/lib/errors';
import { useGetRoomsQuery } from '@/lib/api';

const notices: Record<string, string> = {
  kicked: 'A host removed you from that room.',
  banned: 'You were banned from that room by a host.',
  deleted: 'That room was deleted by its owner.',
};

export const RoomsPage = () => {
  const { data, isLoading, error } = useGetRoomsQuery();
  const [params] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(params.get('create') === '1');
  const [joinOpen, setJoinOpen] = useState(params.get('join') === '1');
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const notice = params.get('notice');
  const noticeText = notice ? notices[notice] : undefined;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8">
      <AppHeader />

      {noticeText && !noticeDismissed ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          <p>{noticeText}</p>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            className="rounded-md p-0.5 text-coral/80 hover:bg-white/5 hover:text-coral"
            aria-label="Dismiss notice"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-bean-300">Your bag</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Rooms</h1>
          <p className="mt-1.5 max-w-lg text-sm text-cream-400">
            Every room keeps its own queue, votes, and playback. Invite your crew or hop into a public
            session.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setJoinOpen(true)}>
            <DoorOpen size={16} /> Join by code
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New room
          </button>
        </div>
      </section>

      {isLoading ? <Loader label="Gathering your rooms" /> : null}

      {error ? (
        <div className="card border-coral/30 p-5 text-sm text-coral">
          {apiErrorMessage(error, 'Could not load your rooms')}
        </div>
      ) : null}

      {data ? (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-bean-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300">
                Rooms you are in
              </h2>
            </div>

            {data.mine.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.mine.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <p className="font-display text-lg font-semibold">No rooms yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-cream-400">
                  Create your first room or join one with a code. Sharing an invite is a two-click job.
                </p>
                <button type="button" className="btn-primary mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> Create a room
                </button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-mint" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-cream-300">
                Public rooms
              </h2>
            </div>

            {data.publicRooms.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.publicRooms.map((room) => (
                  <RoomCard key={room.id} room={room} action="join" />
                ))}
              </div>
            ) : (
              <div className="card p-6 text-sm text-cream-400">
                No public rooms are open right now. Start one and flip its visibility to public.
              </div>
            )}
          </section>

          <p className="pb-6 text-center text-xs text-cream-500">
            Need the full link?{' '}
            <Link to="/" className="text-bean-300 hover:text-bean-200">
              Read how BigBeanBag works
            </Link>
          </p>
        </>
      ) : null}

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </main>
  );
};
