import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Visibility } from '@bigbeanbag/shared';
import { Globe2, Lock, Link2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { apiErrorMessage } from '@/lib/errors';
import { useCreateRoomMutation } from '@/lib/api';

const options: { value: Visibility; label: string; hint: string; icon: typeof Globe2 }[] = [
  { value: 'PUBLIC', label: 'Public', hint: 'Listed for anyone to discover', icon: Globe2 },
  { value: 'UNLISTED', label: 'Unlisted', hint: 'Only people with the code or link', icon: Link2 },
  { value: 'PRIVATE', label: 'Private', hint: 'Invite link only', icon: Lock },
];

export const CreateRoomDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('UNLISTED');
  const [error, setError] = useState('');
  const [createRoom, { isLoading }] = useCreateRoomMutation();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const detail = await createRoom({ name: name.trim(), visibility }).unwrap();
      onClose();
      setName('');
      navigate(`/rooms/${detail.room.code}`);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not create the room'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a room"
      description="Name it, choose who can find it, then share the link."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="room-name" className="label">
            Room name
          </label>
          <input
            id="room-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Friday basement session"
            minLength={2}
            maxLength={50}
            required
            autoFocus
          />
        </div>

        <fieldset>
          <legend className="label">Visibility</legend>
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                  visibility === option.value
                    ? 'border-bean-300/60 bg-bean-400/10'
                    : 'border-white/10 bg-ink-900/50 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                  className="sr-only"
                />
                <option.icon size={16} className="text-bean-300" />
                <span className="flex-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-cream-400">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create room'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
