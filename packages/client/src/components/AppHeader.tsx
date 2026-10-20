import { Disc3 } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { ProfileMenu } from '@/features/auth/ProfileMenu';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${
    isActive ? 'bg-white/10 text-cream-50' : 'text-cream-400 hover:text-cream-100'
  }`;

export const AppHeader = () => {
  const user = useAppSelector((state) => state.auth.user);

  return (
    <header className="flex items-center justify-between gap-4">
      <Link to="/" className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-bean-400 text-ink-900">
          <Disc3 size={20} strokeWidth={2.4} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">BigBeanBag</span>
      </Link>

      <nav className="flex items-center gap-1">
        {user ? (
          <>
            <NavLink to="/rooms" className={navLinkClass}>
              Rooms
            </NavLink>
            <ProfileMenu />
          </>
        ) : (
          <Link to="/login" className="btn-primary px-3.5 py-1.5 text-xs">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
};
