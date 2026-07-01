import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { formatEur, formatPct, moisLabel } from '../../lib/utils';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { MAIN_PL_LINES, OVERHEAD_LINES, SUBTOTAL_NOMS, TOTAL_NOMS } from '../../lib/pl-lines';

export default function PlBuPage() {
  const { bu, annee, mois } = useFiltersStore();
  const [showOverhead, setShowOverhead] = useState(false);

  const { data: plData, isLoading } = useQuery({
    queryKey: ['pl-bu', bu, annee, mois],
    queryFn: () => plService.getPlBu(bu, annee, mois),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Chargement...</div>;

  const rows = plData?.data || [];
  const entiteNames = [...new Set(rows.map((r: { entite: string }) => r.entite))];

  function getValue(entite: string, ligne: string, type: string): number {
    return rows.find((r: { entite: string; lignePl: string; typeValeur: string; montant: number }) =>
      r.entite === entite && r.lignePl === ligne && r.typeValeur === type
    )?.montant || 0;
  }

  function PlRow({ nom, indent }: { nom: string; indent?: boolean }) {
    const isSubtotal = SUBTOTAL_NOMS.has(nom);
    const isTotal    = TOTAL_NOMS.has(nom);
    const rowBg    = isTotal ? 'bg-indigo-50/50 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/50' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
        <td className={`sticky left-0 px-4 py-2.5 text-gray-700 min-w-56 text-xs ${stickyBg} ${indent ? 'pl-8' : ''}`}>{nom}</td>
        {entiteNames.map(e => {
          const actuals  = getValue(e, nom, 'ACTUALS');
          const target   = getValue(e, nom, 'TARGET');
          const vsBudget = target !== 0 ? (actuals - target) / Math.abs(target) : 0;
          return [
            <td key={`${e}-a`} className="px-2 py-2.5 text-right font-mono border-l border-gray-100 text-gray-800 text-xs">{formatEur(actuals, true)}</td>,
            <td key={`${e}-t`} className="px-2 py-2.5 text-right font-mono text-gray-500 text-xs">{formatEur(target, true)}</td>,
            <td key={`${e}-v`} className={`px-2 py-2.5 text-right font-mono font-semibold text-xs ${vsBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {target !== 0 ? `${vsBudget >= 0 ? '+' : ''}${formatPct(vsBudget)}` : '—'}
            </td>,
          ];
        })}
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">P&L {bu} Consolidé</h2>
        <p className="text-sm text-gray-500">YTD {moisLabel(mois)} {annee}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-800">Aucune donnée P&L pour cette BU / période</p>
        </div>
      ) : (
        <>
          {/* P&L principal */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 font-semibold text-gray-600 min-w-56">Ligne P&L</th>
                  {entiteNames.map(e => (
                    <th key={e} colSpan={3} className="text-center px-2 py-3 font-semibold text-gray-700 border-l border-gray-200">{e}</th>
                  ))}
                </tr>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500">
                  <th className="sticky left-0 bg-gray-50/80 px-4 py-2" />
                  {entiteNames.flatMap(e => [
                    <th key={`${e}-a`} className="px-2 py-2 text-right border-l border-gray-100 font-medium">Actuals YTD</th>,
                    <th key={`${e}-t`} className="px-2 py-2 text-right font-medium">Target YTD</th>,
                    <th key={`${e}-v`} className="px-2 py-2 text-right font-medium">vs Budget</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {MAIN_PL_LINES.map(l => <PlRow key={l.nom} nom={l.nom} indent={l.indent} />)}
              </tbody>
            </table>
          </div>

          {/* Détail frais généraux */}
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowOverhead(s => !s)}
              className="w-full bg-gray-50 px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 transition-colors text-xs font-bold text-gray-600 uppercase tracking-wide"
            >
              <span>Détail Frais Généraux</span>
              {showOverhead ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>
            {showOverhead && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <tbody>
                    {OVERHEAD_LINES.map(l => <PlRow key={l.nom} nom={l.nom} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
