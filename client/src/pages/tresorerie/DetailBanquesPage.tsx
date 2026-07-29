import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tresorerieService } from '../../services/tresorerie.service';
import { formatNumber, formatXof } from '../../lib/utils';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DetailBanquesPage() {
  const [date, setDate] = useState(today());
  const [entiteFilter, setEntiteFilter] = useState('');
  const [deviseFilter, setDeviseFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tresorerie-dashboard', date],
    queryFn: () => tresorerieService.getDashboard(date),
  });

  const banques = data?.banques ?? [];
  const entites = useMemo(() => Array.from(new Set(banques.map(b => b.entite))).sort(), [banques]);
  const devises = useMemo(() => Array.from(new Set(banques.map(b => b.devise))).sort(), [banques]);

  const filtered = banques.filter(b =>
    (!entiteFilter || b.entite === entiteFilter) &&
    (!deviseFilter || b.devise === deviseFilter)
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 mr-auto">Détail banques par entité</h2>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
        />
        <select value={entiteFilter} onChange={e => setEntiteFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
          <option value="">Toutes les entités</option>
          {entites.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={deviseFilter} onChange={e => setDeviseFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
          <option value="">Toutes les devises</option>
          {devises.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50/60 border-b text-xs text-gray-500">
                  <th className="text-left px-3 py-2 font-semibold">Entité</th>
                  <th className="text-left px-3 py-2 font-semibold">Banque</th>
                  <th className="text-center px-2 py-2 font-semibold">Devise</th>
                  <th className="text-right px-2 py-2 font-semibold">Position (native)</th>
                  <th className="text-right px-2 py-2 font-semibold">Position (XOF)</th>
                  <th className="text-right px-2 py-2 font-semibold">Position banque (XOF)</th>
                  <th className="text-right px-2 py-2 font-semibold">Écart (XOF)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/30">
                    <td className="px-3 py-1.5 text-gray-700">{b.entite}</td>
                    <td className="px-3 py-1.5 text-gray-700">{b.banque}</td>
                    <td className="px-2 py-1.5 text-center font-mono text-gray-500">{b.devise}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatNumber(b.positionJ)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-800">{formatXof(b.positionJXof)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-500">{formatXof(b.positionBanqueXof)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${Math.abs(b.ecartXof) > 0.5 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {formatXof(b.ecartXof)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-8">Aucune donnée pour cette date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
