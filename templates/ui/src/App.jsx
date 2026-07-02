import { Navigate, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import CanvasWorkspace from './pages/CanvasWorkspace';
import { initTheme } from './lib/theme';

export default function App() {
  useEffect(() => { initTheme(); }, []);

  return (
    <Routes>
      <Route path="/" element={<CanvasWorkspace />} />
      <Route path="/canvas" element={<CanvasWorkspace />} />
      <Route path="*" element={<Navigate to="/canvas" replace />} />
    </Routes>
  );
}
