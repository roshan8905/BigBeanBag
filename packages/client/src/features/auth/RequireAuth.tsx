import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { Loader } from '@/components/Loader';

export const RequireAuth = () => {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  if (status === 'loading') return <Loader label="Waking up your session" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};
