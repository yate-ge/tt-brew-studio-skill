import { Navigate, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import CanvasWorkspace from './pages/CanvasWorkspace';
import { initTheme } from './lib/theme';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  useWebSocket();
  useEffect(() => { initTheme(); }, []);

  return (
    <Routes>
      <Route path="/" element={<CanvasWorkspace />} />
      <Route path="/canvas" element={<CanvasWorkspace />} />
      <Route path="*" element={<Navigate to="/canvas" replace />} />
    </Routes>
  );
}
