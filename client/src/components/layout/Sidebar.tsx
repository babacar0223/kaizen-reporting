import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, TrendingUp, Settings, Upload, ChevronRight, LogOut, Building2, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';

const BU_CONFIG = [
  { key: 'PROCUREMENT', label: 'Procurement', color: '#1B5E8B' },
  { key: 'FREIGHT_FORWARDING', label: 'Freight Fwd', color: '#4A1E8B' },
  { key: 'LOGISTICS', label: 'Logistics', color: '#0E6B5E' },
];

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin', label: 'Import', icon: Upload, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { to: '/figures', label: 'Figures', icon: BarChart3 },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
  { to: '/statistics', label: 'Statistics', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { bu, setBu } = useFiltersStore();
  const { user, logout } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';
  const activeBu = BU_CONFIG.find(b => b.key === bu) || BU_CONFIG[0];

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role || '');
  });

  // For VIEWER: only show BUs they have access to
  const visibleBus = isViewer && user?.buAccess?.length
    ? BU_CONFIG.filter(b => user.buAccess.includes(b.key))
    : BU_CONFIG;

  return (
    <aside className={cn('flex flex-col h-screen bg-[#1B3A6B] text-white transition-all duration-300 border-r border-white/10', collapsed ? 'w-16' : 'w-60')}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-[#00A3B4] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">C</span>
            </div>
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

      {/* BU Selector — hidden for VIEWER with single BU */}
      {(!isViewer || visibleBus.length > 1) && (
        <div className="p-3 border-b border-white/10">
          {visibleBus.map(b => (
            <button
              key={b.key}
              onClick={() => !isViewer && setBu(b.key)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium mb-1 transition-all',
                b.key === bu ? 'bg-white/20' : isViewer ? 'opacity-50 cursor-default' : 'hover:bg-white/10 text-white/60'
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
              {!collapsed && <span>{b.label}</span>}
            </button>
          ))}
        </div>
      )}

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

      {/* Active BU indicator + User */}
      <div className="p-3 border-t border-white/10">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-lg" style={{ backgroundColor: activeBu.color + '33' }}>
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: activeBu.color }} />
            <span className="text-xs font-medium text-white/80">{activeBu.label}</span>
          </div>
        )}
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
