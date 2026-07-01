import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FiguresPage from './pages/figures/FiguresPage';
import PlBuPage from './pages/figures/PlBuPage';
import SalesPage from './pages/figures/SalesPage';
import MensuelPage from './pages/figures/MensuelPage';
import MultiBuPage from './pages/figures/MultiBuPage';
import ChartsPage from './pages/charts/ChartsPage';
import HistoPage from './pages/charts/HistoPage';
import CourbePage from './pages/charts/CourbePage';
import ClientsPage from './pages/charts/ClientsPage';
import WaterfallPage from './pages/charts/WaterfallPage';
import ScorecardPage from './pages/charts/ScorecardPage';
import AdminPage from './pages/admin/AdminPage';
import ImportPage from './pages/admin/ImportPage';
import SaisiePlPage from './pages/admin/SaisiePlPage';
import SaisieSalesPage from './pages/admin/SaisieSalesPage';
import StatisticsPage from './pages/statistics/StatisticsPage';
import SettingsPage from './pages/settings/SettingsPage';
import EntitiesTab from './pages/settings/EntitiesTab';
import EntityReportersTab from './pages/settings/EntityReportersTab';
import UsersTab from './pages/settings/UsersTab';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="admin" element={<AdminPage />}>
              <Route index element={<ImportPage />} />
              <Route path="entry-pl" element={<SaisiePlPage />} />
              <Route path="entry-sales" element={<SaisieSalesPage />} />
            </Route>
            <Route path="figures" element={<FiguresPage />}>
              <Route index element={<PlBuPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="monthly" element={<MensuelPage />} />
              <Route path="consolidated" element={<MultiBuPage />} />
            </Route>
            <Route path="charts" element={<ChartsPage />}>
              <Route index element={<HistoPage />} />
              <Route path="trend" element={<CourbePage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="waterfall" element={<WaterfallPage />} />
              <Route path="scorecard" element={<ScorecardPage />} />
            </Route>
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="settings" element={<SettingsPage />}>
              <Route index element={<EntitiesTab />} />
              <Route path="reporters" element={<EntityReportersTab />} />
              <Route path="users" element={<UsersTab />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
