import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

export default function TresoreriePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const TABS = [
    { to: '/tresorerie', label: 'Saisie du jour', end: true },
    ...(isAdmin ? [
      { to: '/tresorerie/dashboard', label: "Vue d'ensemble", end: false },
      { to: '/tresorerie/banques', label: 'Détail banques', end: false },
      { to: '/tresorerie/parametres', label: 'Paramètres', end: false },
    ] : []),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Trésorerie journalière</h1>
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
