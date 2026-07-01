import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';

const TABS = [
  { to: '/settings', label: 'Entities', end: true },
  { to: '/settings/reporters', label: 'Entity Reporters' },
  { to: '/settings/users', label: 'All Users' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                isActive ? 'border-[#1B3A6B] text-[#1B3A6B]' : 'border-transparent text-gray-500 hover:text-gray-800'
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
