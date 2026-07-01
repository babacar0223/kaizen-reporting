import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';

const TABS = [
  { to: '/graphiques', label: 'Actuals vs Target', end: true },
  { to: '/graphiques/courbe', label: 'Courbe Mensuelle' },
  { to: '/graphiques/clients', label: 'Sales par Client' },
  { to: '/graphiques/waterfall', label: 'Cascade P&L' },
  { to: '/graphiques/heatmap', label: 'Heatmap Marges' },
  { to: '/graphiques/scorecard', label: 'Scorecard BU' },
];

export default function GraphiquesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Module Graphiques</h1>
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(({ to, label, end }) => (
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
      </div>
      <Outlet />
    </div>
  );
}
