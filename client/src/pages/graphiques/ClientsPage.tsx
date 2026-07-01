import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { referentielService } from '../../services/referentiel.service';
import { formatEur, formatPct, moisLabel } from '../../lib/utils';
import api from '../../lib/api';
import type { SalesResponse } from '../../types';

const DONUT_COLORS = ['#00A3B4', '#1B5E8B', '#4A1E8B', '#0E6B5E', '#E8A000', '#C42B1C', '#94a3b8', '#f97316'];

export default function ClientsPage() {
  const { bu, annee, mois, entiteId } = useFiltersStore();

  const { data: entites = [] } = useQuery({ queryKey: ['entites', bu], queryFn: () => referentielService.getEntites(bu) });
  const selectedEntite = entiteId ? entites.find(e => e.id === entiteId) : entites[0];

  const { data } = useQuery({
    queryKey: ['sales', bu, selectedEntite?.id, annee, mois],
    queryFn: () => api.get<SalesResponse>(`/sales/${bu}/${selectedEntite?.id}/${annee}/${mois}`).then(r => r.data),
    enabled: !!selectedEntite?.id,
  });

  const rows = data?.data || [];
  const revenueActuals = rows.filter(r => r.lignePl === 'Revenue' && r.typeValeur === 'ACTUALS' && !r.sousClientNom);
  const revenuTarget = rows.filter(r => r.lignePl === 'Revenue' && r.typeValeur === 'TARGET' && !r.sousClientNom);

  const donutData = revenueActuals.map(r => ({ name: r.clientNom, value: r.montant }));

  const barData = revenueActuals.map(r => {
    const tgt = revenuTarget.find(t => t.clientNom === r.clientNom)?.montant || 0;
    const realisation = tgt > 0 ? r.montant / tgt : 0;
    return { name: r.clientNom, realisation: Math.round(realisation * 100), actuals: r.montant, target: tgt };
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Sales par Client</h2>
        <p className="text-xs text-gray-400">{selectedEntite?.nom} · {moisLabel(mois)} {annee}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Revenue */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Répartition Revenue par Client</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => formatEur(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Barres réalisation budgétaire */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Réalisation budgétaire par Client (%)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} layout="vertical" margin={{ left: 60, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 120]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="realisation" radius={[0, 3, 3, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.realisation >= 90 ? '#107C10' : entry.realisation >= 70 ? '#E8A000' : '#C42B1C'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />≥90%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />70-90%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />&lt;70%</span>
          </div>
        </div>
      </div>

      {/* Tableau de performance */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-600">
              <th className="text-left px-4 py-3 font-semibold">Client</th>
              <th className="px-3 py-3 text-right font-semibold">Rev. Act.</th>
              <th className="px-3 py-3 text-right font-semibold">Rev. Tgt</th>
              <th className="px-3 py-3 text-right font-semibold">Réalisation</th>
              <th className="px-3 py-3 text-center font-semibold">Statut</th>
            </tr>
          </thead>
          <tbody>
            {barData.map(row => (
              <tr key={row.name} className="border-b border-gray-100 hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                <td className="px-3 py-2.5 text-right font-mono">{formatEur(row.actuals, true)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatEur(row.target, true)}</td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${row.realisation >= 90 ? 'text-green-600' : row.realisation >= 70 ? 'text-orange-500' : 'text-red-600'}`}>
                  {formatPct(row.realisation / 100)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${row.realisation >= 90 ? 'bg-green-100 text-green-700' : row.realisation >= 70 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                    {row.realisation >= 90 ? 'OK' : row.realisation >= 70 ? 'Risque' : 'Alerte'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
