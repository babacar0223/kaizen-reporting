import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { referentielService } from '../../services/referentiel.service';
import { salesService } from '../../services/sales.service';
import { formatEur, formatPct } from '../../lib/utils';
import { BU_OPTIONS } from '../../components/layout/ScopeSelector';
import type { ChartsScopeContext } from './ChartsPage';

const ALL_BUS = BU_OPTIONS.map(b => b.value);
const BU_LABEL: Record<string, string> = { PROCUREMENT: 'Procurement', FREIGHT_FORWARDING: 'Freight Fwd', LOGISTICS: 'Logistics' };
const GROUP_COLORS = ['#1B5E8B', '#8B1E5E', '#0E6B5E', '#B45309', '#4A1E8B', '#0F766E', '#9333EA'];
const groupColor = (name: string, i: number) => (name.toUpperCase() === 'OTHERS' ? '#94a3b8' : GROUP_COLORS[i % GROUP_COLORS.length]);

export default function ClientsPage() {
  const { scope } = useOutletContext<ChartsScopeContext>();
  const { bu, annee, mois, entiteId } = useFiltersStore();
  const isGroup = scope === 'GROUP';
  const buForEntites = isGroup ? bu : scope;

  const { data: entites = [] } = useQuery({ queryKey: ['entites', buForEntites], queryFn: () => referentielService.getEntites(buForEntites) });
  const selectedEntite = !isGroup && entiteId ? entites.find(e => e.id === entiteId) : undefined;

  const buList = isGroup ? ALL_BUS : [scope];
  const results = useQueries({
    queries: buList.map(b => ({
      queryKey: ['clients-overview', b, annee, mois],
      queryFn: () => salesService.getClientsOverview(b, annee, mois),
    })),
  });
  const isLoading = results.some(r => r.isLoading);

  const groups = useMemo(() => {
    const all = results.flatMap(r => r.data?.clients ?? []);
    const filtered = selectedEntite ? all.filter(c => c.entiteId === selectedEntite.id) : all;
    const map = new Map<string, { groupe: string; rev: number; gm: number; budgetAnnual: number; count: number }>();
    for (const c of filtered) {
      const g = c.groupe || 'Others';
      const agg = map.get(g) ?? { groupe: g, rev: 0, gm: 0, budgetAnnual: 0, count: 0 };
      agg.rev += c.revActual;
      agg.gm += c.gmActual;
      agg.budgetAnnual += c.revTargetAnnual || 0;
      agg.count += 1;
      map.set(g, agg);
    }
    const totalRev = [...map.values()].reduce((s, g) => s + g.rev, 0);
    return [...map.values()]
      .map(g => {
        const budgetYtd = (g.budgetAnnual / 12) * mois;
        return {
          ...g,
          budgetYtd,
          share: totalRev !== 0 ? g.rev / totalRev : 0,
          realisation: budgetYtd !== 0 ? (g.rev / budgetYtd) * 100 : 0,
          marginRate: g.rev !== 0 ? g.gm / g.rev : null,
        };
      })
      .sort((a, b) => (a.groupe === 'Others' ? 1 : b.groupe === 'Others' ? -1 : b.rev - a.rev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map(r => r.dataUpdatedAt).join(','), selectedEntite?.id, mois]);

  const scopeLabel = isGroup ? 'Group' : `${BU_LABEL[scope] ?? scope}${selectedEntite ? ` · ${selectedEntite.nom}` : ' · all entities'}`;
  const totalRev = groups.reduce((s, g) => s + g.rev, 0);

  const donutData = groups.filter(g => g.rev > 0).map(g => ({ name: g.groupe, value: g.rev }));
  const barData = groups.map(g => ({ name: g.groupe, realisation: Math.round(g.realisation) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Sales by Client Group</h2>
        <span className="ml-auto text-xs text-gray-400">{scopeLabel} · YTD {annee}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>
      ) : groups.length === 0 || totalRev === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
          No client data for this scope. Groups are configured in <strong>Import &amp; Data Entry → Client Groups</strong>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue split by group */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue split by group</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={donutData} cx="50%" cy="50%" innerRadius={65} outerRadius={105} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} · ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}
                  >
                    {donutData.map((d, i) => <Cell key={i} fill={groupColor(d.name, groups.findIndex(g => g.groupe === d.name))} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [formatEur(Number(value)), name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Budget achievement by group */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Budget achievement by group (%)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} layout="vertical" margin={{ left: 20, right: 44 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 150]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Bar dataKey="realisation" radius={[0, 3, 3, 0]} barSize={22}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.realisation >= 90 ? '#107C10' : entry.realisation >= 70 ? '#E8A000' : '#C42B1C'} />
                    ))}
                    <LabelList dataKey="realisation" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 10, fontWeight: 700, fill: '#374151' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />≥90 %</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />70-90 %</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />&lt;70 %</span>
              </div>
            </div>
          </div>

          {/* Tableau par groupe */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500">
                  <th className="text-left px-4 py-3 font-semibold">Group</th>
                  <th className="px-3 py-3 text-right font-semibold">Clients</th>
                  <th className="px-3 py-3 text-right font-semibold">Sales YTD</th>
                  <th className="px-3 py-3 text-right font-semibold">% of Revenue</th>
                  <th className="px-3 py-3 text-right font-semibold">Budget YTD</th>
                  <th className="px-3 py-3 text-right font-semibold">Achievement</th>
                  <th className="px-3 py-3 text-right font-semibold">Margin YTD</th>
                  <th className="px-3 py-3 text-right font-semibold">Margin rate</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.groupe} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-bold text-gray-800 border-l-4" style={{ borderColor: groupColor(g.groupe, i) }}>{g.groupe}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{g.count}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">{formatEur(g.rev, true)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatPct(g.share)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{g.budgetYtd ? formatEur(g.budgetYtd, true) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${g.budgetYtd === 0 ? 'text-gray-300' : g.realisation >= 90 ? 'text-green-600' : g.realisation >= 70 ? 'text-orange-500' : 'text-red-600'}`}>
                      {g.budgetYtd ? `${Math.round(g.realisation)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${g.gm >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatEur(g.gm, true)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{g.marginRate !== null ? formatPct(g.marginRate) : '—'}</td>
                  </tr>
                ))}
                {groups.length > 1 && (
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                    <td className="px-4 py-2.5 text-gray-800">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{groups.reduce((s, g) => s + g.count, 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-900">{formatEur(totalRev, true)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">100 %</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatEur(groups.reduce((s, g) => s + g.budgetYtd, 0), true)}</td>
                    <td className="px-3 py-2.5"></td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-900">{formatEur(groups.reduce((s, g) => s + g.gm, 0), true)}</td>
                    <td className="px-3 py-2.5"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
