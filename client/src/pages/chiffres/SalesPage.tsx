import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { referentielService } from '../../services/referentiel.service';
import { formatEur, formatPct, moisLabel } from '../../lib/utils';
import api from '../../lib/api';
import type { SalesResponse } from '../../types';

export default function SalesPage() {
  const { bu, annee, mois, entiteId } = useFiltersStore();

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', bu],
    queryFn: () => referentielService.getEntites(bu),
  });

  const selectedEntite = entiteId ? entites.find(e => e.id === entiteId) : entites[0];

  const { data, isLoading } = useQuery({
    queryKey: ['sales', bu, selectedEntite?.id, annee, mois],
    queryFn: () => api.get<SalesResponse>(`/sales/${bu}/${selectedEntite?.id}/${annee}/${mois}`).then(r => r.data),
    enabled: !!selectedEntite?.id,
  });

  const rows = data?.data || [];
  const clients = [...new Set(rows.map(r => r.clientNom))];

  function getVal(clientNom: string, lignePl: string, typeValeur: string): number {
    return rows.find(r =>
      r.clientNom === clientNom && r.lignePl === lignePl && r.typeValeur === typeValeur && !r.sousClientNom
    )?.montant || 0;
  }
  function getShare(clientNom: string): number {
    return rows.find(r => r.clientNom === clientNom && r.lignePl === 'Revenue' && r.typeValeur === 'ACTUALS')?.sharePct || 0;
  }

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Sales & Margin</h2>
        <p className="text-sm text-gray-500">{selectedEntite?.nom} · {moisLabel(mois)} {annee}</p>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Aucune donnée Sales pour cette entité / période</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full text-xs">
            <thead>
              {/* En-têtes groupés */}
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                <th className="sticky left-0 bg-gray-50 text-left px-4 py-2 min-w-44 font-semibold" rowSpan={2}>Client</th>
                <th colSpan={4} className="px-2 py-2 text-center font-semibold border-l border-gray-200 text-blue-700">Chiffre d'affaires</th>
                <th colSpan={4} className="px-2 py-2 text-center font-semibold border-l border-gray-200 text-teal-700">Marge brute</th>
                <th className="px-2 py-2 text-center font-semibold border-l border-gray-200 text-gray-500" rowSpan={2}>Part %</th>
              </tr>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 text-xs">
                <th className="px-2 py-2 text-right border-l border-gray-200 font-medium">MTD</th>
                <th className="px-2 py-2 text-right font-medium">YTD</th>
                <th className="px-2 py-2 text-right font-medium">Budget</th>
                <th className="px-2 py-2 text-right font-medium">vs Bdgt</th>
                <th className="px-2 py-2 text-right border-l border-gray-200 font-medium">MTD</th>
                <th className="px-2 py-2 text-right font-medium">YTD</th>
                <th className="px-2 py-2 text-right font-medium">Tx Mg%</th>
                <th className="px-2 py-2 text-right font-medium">vs N-1</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const revMtd  = getVal(client, 'Revenue', 'ACTUALS_MTD');
                const revYtd  = getVal(client, 'Revenue', 'ACTUALS');
                const revTgt  = getVal(client, 'Revenue', 'TARGET');
                const gmMtd   = getVal(client, 'Gross Margin', 'ACTUALS_MTD');
                const gmYtd   = getVal(client, 'Gross Margin', 'ACTUALS');
                const gmN1    = getVal(client, 'Gross Margin', 'YTD_N1');
                const gmPct   = revYtd !== 0 ? gmYtd / revYtd : 0;
                const vsRevTgt = revTgt !== 0 ? (revYtd - revTgt) / Math.abs(revTgt) : 0;
                const vsGmN1  = gmN1   !== 0 ? (gmYtd  - gmN1)  / Math.abs(gmN1)  : 0;

                return (
                  <tr key={client} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="sticky left-0 bg-white px-4 py-2.5 text-gray-800 font-medium">{client}</td>
                    {/* CA */}
                    <td className="px-2 py-2.5 text-right font-mono text-gray-700 border-l border-gray-100">{formatEur(revMtd, true)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-gray-900 font-semibold">{formatEur(revYtd, true)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-gray-400">{formatEur(revTgt, true)}</td>
                    <td className={`px-2 py-2.5 text-right font-mono font-semibold ${vsRevTgt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {revTgt !== 0 ? `${vsRevTgt >= 0 ? '+' : ''}${formatPct(vsRevTgt)}` : '—'}
                    </td>
                    {/* Marge */}
                    <td className="px-2 py-2.5 text-right font-mono text-gray-700 border-l border-gray-100">{formatEur(gmMtd, true)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-gray-900 font-semibold">{formatEur(gmYtd, true)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-blue-700">{formatPct(gmPct)}</td>
                    <td className={`px-2 py-2.5 text-right font-mono font-semibold ${vsGmN1 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {gmN1 !== 0 ? `${vsGmN1 >= 0 ? '+' : ''}${formatPct(vsGmN1)}` : '—'}
                    </td>
                    {/* Part */}
                    <td className="px-2 py-2.5 text-right font-mono text-gray-600 border-l border-gray-100">{formatPct(getShare(client))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
