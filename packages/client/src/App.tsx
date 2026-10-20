import { useGetMeQuery } from '@/lib/api';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './features/auth/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { RoomPage } from './pages/RoomPage';
import { RoomsPage } from './pages/RoomsPage';

export const App = () => {
  useGetMeQuery();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/:code" element={<RoomPage />} />
        <Route path="/join/:token" element={<JoinPage />} />
      </Route>
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
};
