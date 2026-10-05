import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import PageFilters from '../../components/layout/PageFilters';

const ALL_TABS = [
  { to: '/figures',              label: 'P&L Consolidated', end: true,  viewerOk: true  },
  { to: '/figures/consolidated', label: 'Multi-BU',         end: false, viewerOk: false },
];

export default function FiguresPage() {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  const isViewer = user?.role === 'VIEWER';
  const tabs = isViewer ? ALL_TABS.filter(t => t.viewerOk) : ALL_TABS;
  // P&L Consolidated a son propre sélecteur de périmètre ; Multi-BU est déjà consolidé sur les 3 BU.
  // Dans les deux cas les boutons BU / Entité de la barre globale n'ont aucun effet → on les masque.
  const hideBuEntity = pathname === '/figures' || pathname === '/figures/consolidated';

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Financial Figures</h1>
      <PageFilters showEntity={!hideBuEntity} showBu={!hideBuEntity} />

      {/* Tab nav — sits right below the filter bar (filter bar already has border-b) */}
      <div className="border-b border-gray-200 -mt-[1px] mb-5">
        <nav className="flex gap-1">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-[#1B3A6B] text-[#1B3A6B]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              )}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
