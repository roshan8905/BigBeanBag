import { useGetMeQuery } from '@/lib/api';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './features/auth/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './pages/HomePage';
import { RoomsPage } from './pages/RoomsPage';

export const App = () => {
  useGetMeQuery();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/rooms" element={<RoomsPage />} />
      </Route>
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
};
