import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, TrendingUp, Settings, Upload, ChevronRight, LogOut, Activity, Wallet, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../stores/auth.store';

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; roles?: string[]; hideForViewer?: boolean; needsTreasury?: boolean }

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, hideForViewer: true },
  { to: '/admin', label: 'Import', icon: Upload },
  { to: '/figures', label: 'Figures', icon: BarChart3 },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
  { to: '/statistics', label: 'Statistics', icon: Activity },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/tresorerie', label: 'Trésorerie', icon: Wallet, needsTreasury: true },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.roles && !item.roles.includes(user?.role || '')) return false;
    if (isViewer && item.hideForViewer) return false;
    // Trésorerie : cachée pour un VIEWER sans entité de trésorerie autorisée.
    if (item.needsTreasury && isViewer && !(user?.tresorerieEntitesAccess?.length)) return false;
    return true;
  });

  return (
    <aside className={cn('flex flex-col h-screen bg-[#1B3A6B] text-white transition-all duration-300 border-r border-white/10', collapsed ? 'w-16' : 'w-60')}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/CSTT-AO.png" alt="CSTT AO" className="w-8 h-8 rounded-md object-contain flex-shrink-0 bg-white/10" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white leading-tight truncate">CSTT AO</p>
              <p className="text-xs text-white/40 truncate">Reporting Group</p>
            </div>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1 rounded hover:bg-white/10 ml-auto flex-shrink-0">
          <ChevronRight className={cn('w-4 h-4 transition-transform', collapsed ? '' : 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => cn('flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-all', isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.prenom?.[0]}{user?.nom?.[0]}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/90 truncate">{user?.prenom} {user?.nom}</p>
              <p className="text-xs text-white/40 truncate">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
          )}
          <button onClick={logout} className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white" title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
