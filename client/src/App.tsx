import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/auth.store';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FiguresPage from './pages/figures/FiguresPage';
import PlBuPage from './pages/figures/PlBuPage';
import MultiBuPage from './pages/figures/MultiBuPage';
import ChartsPage from './pages/charts/ChartsPage';
import HistoPage from './pages/charts/HistoPage';
import CourbePage from './pages/charts/CourbePage';
import ClientsPage from './pages/charts/ClientsPage';
import WaterfallPage from './pages/charts/WaterfallPage';
import AdminPage from './pages/admin/AdminPage';
import ImportPage from './pages/admin/ImportPage';
import SaisiePlPage from './pages/admin/SaisiePlPage';
import SaisieSalesPage from './pages/admin/SaisieSalesPage';
import GroupesClientsPage from './pages/admin/GroupesClientsPage';
import StatisticsPage from './pages/statistics/StatisticsPage';
import SettingsPage from './pages/settings/SettingsPage';
import EntitiesTab from './pages/settings/EntitiesTab';
import EntityReportersTab from './pages/settings/EntityReportersTab';
import UsersTab from './pages/settings/UsersTab';
import ClientsOverviewPage from './pages/clients/ClientsOverviewPage';
import TresoreriePage from './pages/tresorerie/TresoreriePage';
import SaisieTresoreriePage from './pages/tresorerie/SaisieTresoreriePage';
import DashboardTresoreriePage from './pages/tresorerie/DashboardTresoreriePage';
import DetailBanquesPage from './pages/tresorerie/DetailBanquesPage';
import ParametresTresoreriePage from './pages/tresorerie/ParametresTresoreriePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Un VIEWER (reporter d'entité) n'a pas accès au périmètre groupe : Dashboard,
// Multi-BU consolidé et l'administration des utilisateurs. On le renvoie vers Figures.
function ViewerBlocked({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.user?.role);
  if (role === 'VIEWER') return <Navigate to="/figures" replace />;
  return <>{children}</>;
}

function HomeRoute() {
  const role = useAuthStore(s => s.user?.role);
  if (role === 'VIEWER') return <Navigate to="/figures" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<HomeRoute />} />
            <Route path="admin" element={<AdminPage />}>
              <Route index element={<ImportPage />} />
              <Route path="entry-pl" element={<SaisiePlPage />} />
              <Route path="entry-sales" element={<SaisieSalesPage />} />
              <Route path="groupes-clients" element={<ViewerBlocked><GroupesClientsPage /></ViewerBlocked>} />
            </Route>
            <Route path="figures" element={<FiguresPage />}>
              <Route index element={<PlBuPage />} />
              <Route path="consolidated" element={<ViewerBlocked><MultiBuPage /></ViewerBlocked>} />
            </Route>
            <Route path="charts" element={<ChartsPage />}>
              <Route index element={<HistoPage />} />
              <Route path="trend" element={<CourbePage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="waterfall" element={<WaterfallPage />} />
            </Route>
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="clients" element={<ClientsOverviewPage />} />
            <Route path="tresorerie" element={<TresoreriePage />}>
              <Route index element={<SaisieTresoreriePage />} />
              <Route path="dashboard" element={<DashboardTresoreriePage />} />
              <Route path="banques" element={<DetailBanquesPage />} />
              <Route path="parametres" element={<ParametresTresoreriePage />} />
            </Route>
            <Route path="settings" element={<ViewerBlocked><SettingsPage /></ViewerBlocked>}>
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
