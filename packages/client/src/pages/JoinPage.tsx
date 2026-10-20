import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader } from '@/components/Loader';
import { apiErrorMessage } from '@/lib/errors';
import { useJoinRoomByTokenMutation } from '@/lib/api';

export const JoinPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [joinByToken] = useJoinRoomByTokenMutation();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    joinByToken(token)
      .unwrap()
      .then((detail) => navigate(`/rooms/${detail.room.code}`, { replace: true }))
      .catch((cause) => setError(apiErrorMessage(cause, 'This invite link does not work')));
  }, [token, joinByToken, navigate]);

  return (
    <main className="grid min-h-screen place-items-center px-5">
      {error ? (
        <div className="card max-w-md p-7 text-center">
          <h1 className="font-display text-xl font-semibold">Invite trouble</h1>
          <p className="mt-2 text-sm text-cream-400">{error}</p>
          <Link to="/rooms" className="btn-primary mt-5">
            Back to your rooms
          </Link>
        </div>
      ) : (
        <Loader label="Pulling you into the room" />
      )}
    </main>
  );
};
