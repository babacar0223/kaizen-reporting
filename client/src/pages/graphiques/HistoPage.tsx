import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { formatEur, moisLabel } from '../../lib/utils';

const LIGNES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];
const COLORS = { ACTUALS: '#00A3B4', TARGET: '#E8A000', YTD_N1: '#94a3b8' };

export default function HistoPage() {
  const { bu, annee, mois } = useFiltersStore();
  const [selectedLigne, setSelectedLigne] = useState('Revenue');

  const { data, isLoading } = useQuery({
    queryKey: ['pl-bu', bu, annee, mois],
    queryFn: () => plService.getPlBu(bu, annee, mois),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Chargement...</div>;

  const rows = data?.data || [];
  const entites = [...new Set(rows.map(r => r.entite))];

  const chartData = entites.map(e => ({
    name: e,
    Actuals: rows.find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'ACTUALS')?.montant || 0,
    Target: rows.find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'TARGET')?.montant || 0,
    'N-1': rows.find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'YTD_N1')?.montant || 0,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-base font-semibold text-gray-800">Actuals vs Target vs N-1</h2>
        <div className="flex gap-2 ml-4">
          {LIGNES.map(l => (
            <button
              key={l}
              onClick={() => setSelectedLigne(l)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${selectedLigne === l ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">YTD {moisLabel(mois)} {annee}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => formatEur(v, true)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => formatEur(Number(value))} />
            <Legend />
            <Bar dataKey="Actuals" fill={COLORS.ACTUALS} radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.Actuals >= entry.Target ? '#107C10' : '#C42B1C'}
                />
              ))}
            </Bar>
            <Bar dataKey="Target" fill={COLORS.TARGET} radius={[3, 3, 0, 0]} />
            <Bar dataKey="N-1" fill={COLORS.YTD_N1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400 text-center">Vert = Actuals &gt; Target · Rouge = Actuals &lt; Target</p>
    </div>
  );
}
