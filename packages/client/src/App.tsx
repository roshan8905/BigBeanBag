import { Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';

export const App = () => (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="*" element={<HomePage />} />
  </Routes>
);
