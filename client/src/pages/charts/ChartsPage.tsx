import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';
import { useFiltersStore } from '../../stores/filters.store';
import PageFilters from '../../components/layout/PageFilters';
import ScopeSelector, { type Scope } from '../../components/layout/ScopeSelector';

const ALL_TABS = [
  { to: '/charts',            label: 'Actuals vs Target', end: true,  viewerOk: true },
  { to: '/charts/trend',      label: 'Monthly Trend',     end: false, viewerOk: true },
  { to: '/charts/clients',    label: 'Sales by Group',    end: false, viewerOk: true },
  { to: '/charts/waterfall',  label: 'P&L Waterfall',     end: false, viewerOk: true },
];

export interface ChartsScopeContext { scope: Scope }

export default function ChartsPage() {
  const { user } = useAuthStore();
  const { bu, setBu } = useFiltersStore();
  const isViewer = user?.role === 'VIEWER';
  const tabs = isViewer ? ALL_TABS.filter(t => t.viewerOk) : ALL_TABS;
  const [scope, setScope] = useState<Scope>(bu as Scope);

  function handleScopeChange(s: Scope) {
    setScope(s);
    if (s !== 'GROUP') setBu(s); // garde le sélecteur Entité de PageFilters cohérent avec la BU choisie
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Charts & Analytics</h1>
      <PageFilters showEntity showBu={false} />

      <div className="border-b border-gray-200 -mt-[1px] mb-5 flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                isActive ? 'border-[#00A3B4] text-[#00A3B4]' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              )}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="pb-1.5">
          <ScopeSelector value={scope} onChange={handleScopeChange} />
        </div>
      </div>

      <Outlet context={{ scope } satisfies ChartsScopeContext} />
    </div>
  );
}
