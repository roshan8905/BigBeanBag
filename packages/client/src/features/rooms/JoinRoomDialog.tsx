import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/Modal';
import { apiErrorMessage } from '@/lib/errors';
import { useJoinRoomMutation } from '@/lib/api';

export const JoinRoomDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joinRoom, { isLoading }] = useJoinRoomMutation();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const detail = await joinRoom({ code: code.trim().toUpperCase() }).unwrap();
      onClose();
      setCode('');
      navigate(`/rooms/${detail.room.code}`);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not join that room'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Join a room" description="Enter the six character room code.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="room-code" className="label">
            Room code
          </label>
          <input
            id="room-code"
            className="input text-center font-display text-2xl uppercase tracking-[0.4em]"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))
            }
            placeholder="BEAN42"
            inputMode="text"
            autoComplete="off"
            required
            autoFocus
          />
        </div>

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading || code.length !== 6}>
            {isLoading ? 'Joining…' : 'Join room'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
