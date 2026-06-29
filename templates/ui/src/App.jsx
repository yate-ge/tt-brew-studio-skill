import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/layout/AppLayout';
import ProjectHome from './pages/ProjectHome';
import Reports from './pages/Reports';
import ReportNew from './pages/ReportNew';
import ReportDetail from './pages/ReportDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import DeliveryPage from './pages/DeliveryPage';
import { initTheme } from './lib/theme';

export default function App() {
  useEffect(() => { initTheme(); }, []);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProjectHome />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/new" element={<ReportNew />} />
        <Route path="/reports/:reportId" element={<ReportDetail />} />
        <Route path="/d/:id" element={<DeliveryPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
