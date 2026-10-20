import { Link, useParams } from 'react-router-dom';
import { Loader } from '@/components/Loader';
import { RoomPreview } from '@/features/room/RoomPreview';
import { RoomWorkspace } from '@/features/room/RoomWorkspace';
import { apiErrorMessage } from '@/lib/errors';
import { useGetRoomQuery } from '@/lib/api';

export const RoomPage = () => {
  const { code = '' } = useParams();
  const { data, isLoading, error } = useGetRoomQuery(code, { skip: !code });

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

  return data.role ? <RoomWorkspace detail={data} /> : <RoomPreview detail={data} />;
};
