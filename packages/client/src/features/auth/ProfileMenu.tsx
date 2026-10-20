import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Plus, Users } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { signedOut } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/lib/api';

export const ProfileMenu = () => {
  const user = useAppSelector((state) => state.auth.user);
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-7 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-7 place-items-center rounded-full bg-bean-400 text-xs font-bold text-ink-900">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="max-w-[9rem] truncate">{user.name}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-ink-800 p-1 shadow-panel"
        >
          <Link
            to="/rooms"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream-200 hover:bg-white/5"
          >
            <Users size={14} /> Your rooms
          </Link>
          <Link
            to="/rooms?create=1"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream-200 hover:bg-white/5"
          >
            <Plus size={14} /> New room
          </Link>
          <SignOutItem onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
};

const SignOutItem = ({ onDone }: { onDone: () => void }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout, { isLoading }] = useLogoutMutation();

  const handle = async () => {
    await logout().unwrap().catch(() => undefined);
    dispatch(signedOut());
    onDone();
    navigate('/');
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={isLoading}
      onClick={() => void handle()}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-coral hover:bg-white/5"
    >
      <LogOut size={14} /> {isLoading ? 'Signing out…' : 'Sign out'}
    </button>
  );
};
