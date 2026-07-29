import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tresorerieService } from '../../services/tresorerie.service';
import { formatXof } from '../../lib/utils';
import { Wallet, TrendingUp, AlertTriangle, Building2 } from 'lucide-react';
import type { TresorerieHierarchieNode } from '../../types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function HierarchyNode({ node, depth = 0, maxAbs }: { node: TresorerieHierarchieNode; depth?: number; maxAbs: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children?.length;
  const pct = maxAbs > 0 ? Math.min(Math.abs(node.positionJXof) / maxAbs, 1) * 100 : 0;

  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen(o => !o)}
        className={`w-full flex items-center gap-2 py-2 px-3 text-left hover:bg-gray-50 rounded-lg ${depth === 0 ? 'font-bold' : depth === 1 ? 'font-semibold' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
      >
        {hasChildren && <span className="text-gray-400 text-xs w-3">{open ? '▾' : '▸'}</span>}
        {!hasChildren && <span className="w-3" />}
        <span className={`flex-1 text-xs ${depth === 0 ? 'text-gray-800' : 'text-gray-600'}`}>{node.label}</span>
        <div className="hidden sm:block w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#00A3B4] rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-xs text-gray-700 w-32 text-right">{formatXof(node.positionJXof, true)}</span>
      </button>
      {hasChildren && open && (
        <div>
          {node.children!.map(child => (
            <HierarchyNode key={child.label} node={child} depth={depth + 1} maxAbs={maxAbs} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardTresoreriePage() {
  const [date, setDate] = useState(today());
  const { data, isLoading } = useQuery({
    queryKey: ['tresorerie-dashboard', date],
    queryFn: () => tresorerieService.getDashboard(date),
  });

  const maxAbs = Math.max(1, ...(data?.hierarchie.map(n => Math.abs(n.positionJXof)) ?? [1]));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-gray-800">Vue d'ensemble consolidée</h2>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center mb-3">
                <Wallet className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Position totale</p>
              <p className="text-xl font-black text-gray-900">{formatXof(data.kpi.positionTotaleXof, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center mb-3">
                <TrendingUp className="w-4.5 h-4.5 text-teal-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Flux net du jour</p>
              <p className={`text-xl font-black ${data.kpi.fluxNetXof >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatXof(data.kpi.fluxNetXof, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center mb-3">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Écart total</p>
              <p className={`text-xl font-black ${Math.abs(data.kpi.ecartTotalXof) < 1 ? 'text-gray-400' : 'text-amber-600'}`}>{formatXof(data.kpi.ecartTotalXof, true)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center mb-3">
                <Building2 className="w-4.5 h-4.5 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Entités actives</p>
              <p className="text-xl font-black text-gray-900">{data.kpi.nombreEntites}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Position par Groupe → Pays → Entité</span>
            </div>
            <div className="p-2">
              {data.hierarchie.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Aucune saisie pour cette date.</p>
              )}
              {data.hierarchie.map(node => (
                <HierarchyNode key={node.label} node={node} maxAbs={maxAbs} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
