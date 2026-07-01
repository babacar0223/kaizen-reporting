import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';

const TABS = [
  { to: '/chiffres', label: 'P&L BU Consolidé', end: true },
  { to: '/chiffres/sales', label: 'Sales & Margin' },
  { to: '/chiffres/mensuel', label: 'Vue Mensuelle' },
  { to: '/chiffres/multi-bu', label: 'Multi-BU' },
];

export default function ChiffresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Module Chiffres</h1>
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
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
