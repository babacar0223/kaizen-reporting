import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { formatEur, MOIS_FR } from '../../lib/utils';

const LIGNES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];

export default function CourbePage() {
  const { bu, annee, entiteId } = useFiltersStore();
  const [selectedLigne, setSelectedLigne] = useState('Revenue');

  const { data: entites = [] } = useQuery({ queryKey: ['entites', bu], queryFn: () => referentielService.getEntites(bu) });
  const selectedEntite = entiteId ? entites.find(e => e.id === entiteId) : entites[0];

  const { data } = useQuery({
    queryKey: ['pl-entite-mensuel', bu, selectedEntite?.id, annee],
    queryFn: () => plService.getPlEntite(bu, selectedEntite!.id, annee, 12),
    enabled: !!selectedEntite?.id,
  });

  const rows: Array<{ mois: number; lignePl: { nom: string }; typeValeur: string; typePeriode: string; montant: number }> = (data as { data?: typeof rows })?.data || [];

  // Budget annuel ÷ 12 → ligne plate mensuelle
  const annualBudget = rows.find(r => r.lignePl.nom === selectedLigne && r.typeValeur === 'TARGET');
  const monthlyBudget = annualBudget ? Number(annualBudget.montant) / 12 : null;

  const chartData = MOIS_FR.map((m, i) => {
    const moisNum = i + 1;
    const actuals = rows.find(r => r.mois === moisNum && r.lignePl.nom === selectedLigne && r.typeValeur === 'ACTUALS' && r.typePeriode === 'MTD')?.montant || null;
    const n1 = rows.find(r => r.mois === moisNum && r.lignePl.nom === selectedLigne && r.typeValeur === 'YTD_N1')?.montant || null;
    return { name: m, 'Actuals': actuals ? Number(actuals) : null, 'Budget/mois': monthlyBudget, 'N-1': n1 ? Number(n1) : null };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Monthly Trend</h2>
        <div className="flex gap-2">
          {LIGNES.map(l => (
            <button key={l} onClick={() => setSelectedLigne(l)} className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${selectedLigne === l ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{selectedEntite?.nom} · {annee}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => formatEur(v, true)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => formatEur(Number(value))} />
            <Legend />
            <Line type="monotone" dataKey="Actuals" stroke="#00A3B4" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            <Line type="monotone" dataKey="Budget/mois" stroke="#E8A000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls={true} />
            <Line type="monotone" dataKey="N-1" stroke="#94a3b8" strokeWidth={1.5} dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

