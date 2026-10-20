import { useEffect, useState } from 'react';
import type { Room, Visibility } from '@bigbeanbag/shared';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { getSocket } from '@/lib/socket';

const visibilityOptions: { value: Visibility; label: string; hint: string }[] = [
  { value: 'PUBLIC', label: 'Public', hint: 'Listed for anyone to find' },
  { value: 'UNLISTED', label: 'Unlisted', hint: 'Code or link only' },
  { value: 'PRIVATE', label: 'Private', hint: 'Invite link only' },
];

export const RoomSettingsDialog = ({
  open,
  onClose,
  room,
}: {
  open: boolean;
  onClose: () => void;
  room: Room;
}) => {
  const [name, setName] = useState(room.name);
  const [visibility, setVisibility] = useState<Visibility>(room.visibility);
  const [locked, setLocked] = useState(room.locked);
  const [chatRestricted, setChatRestricted] = useState(room.chatRestricted);
  const [addRestricted, setAddRestricted] = useState(room.addRestricted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setVisibility(room.visibility);
    setLocked(room.locked);
    setChatRestricted(room.chatRestricted);
    setAddRestricted(room.addRestricted);
    setError('');
  }, [open, room]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('Give the room a name with at least two characters.');
      return;
    }

    const socket = getSocket();
    if (!socket.connected) {
      setError('Still connecting. Try again in a second.');
      return;
    }

    setSaving(true);

    const updateResult = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      socket.emit('room:update', { name: name.trim(), visibility }, resolve);
    });

    if (!updateResult.ok) {
      setSaving(false);
      setError(updateResult.message ?? 'Could not save the room');
      return;
    }

    const restrictResult = await new Promise<{ ok: boolean; message?: string }>((resolve) => {
      socket.emit('room:restrict', { locked, chatRestricted, addRestricted }, resolve);
    });

    setSaving(false);

    if (!restrictResult.ok) {
      setError(restrictResult.message ?? 'Could not save the restrictions');
      return;
    }

    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Room settings"
      description="Only the owner can change these. Everyone sees updates live."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div>
          <label htmlFor="settings-name" className="label">
            Room name
          </label>
          <input
            id="settings-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={50}
            required
          />
        </div>

        <fieldset>
          <legend className="label">Visibility</legend>
          <div className="grid grid-cols-3 gap-2">
            {visibilityOptions.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border px-2 py-2 text-center text-xs transition ${
                  visibility === option.value
                    ? 'border-bean-300/60 bg-bean-400/10 text-bean-200'
                    : 'border-white/10 bg-ink-900/50 text-cream-400 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="settings-visibility"
                  value={option.value}
                  checked={visibility === option.value}
                  onChange={() => setVisibility(option.value)}
                  className="sr-only"
                />
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-cream-500">{option.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          {[
            {
              key: 'locked',
              label: 'Lock the room',
              hint: 'Block new people from joining',
              value: locked,
              set: setLocked,
            },
            {
              key: 'chat',
              label: 'Restrict chat',
              hint: 'Only hosts can send messages',
              value: chatRestricted,
              set: setChatRestricted,
            },
            {
              key: 'add',
              label: 'Restrict adding songs',
              hint: 'Only hosts can queue tracks',
              value: addRestricted,
              set: setAddRestricted,
            },
          ].map((toggle) => (
            <label
              key={toggle.key}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 px-3 py-2.5"
            >
              <span>
                <span className="block text-sm font-medium">{toggle.label}</span>
                <span className="block text-[11px] text-cream-500">{toggle.hint}</span>
              </span>
              <input
                type="checkbox"
                checked={toggle.value}
                onChange={(event) => toggle.set(event.target.checked)}
                className="size-4 accent-bean-400"
              />
            </label>
          ))}
        </div>

        {error ? <p className="text-sm text-coral">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
