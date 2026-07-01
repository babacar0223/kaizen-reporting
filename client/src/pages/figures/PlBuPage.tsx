import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { formatEur, formatPct } from '../../lib/utils';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { MAIN_PL_LINES, OVERHEAD_LINES, SUBTOTAL_NOMS, TOTAL_NOMS } from '../../lib/pl-lines';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Row = { entite: string; lignePl: string; typeValeur: string; montant: number };

export default function PlBuPage() {
  const { bu, annee, mois, moisMin } = useFiltersStore();
  const nMonths = mois - moisMin + 1;
  const [showOverhead, setShowOverhead] = useState(false);

  // YTD through `mois` — always fetched
  const { data: plData, isLoading } = useQuery({
    queryKey: ['pl-bu', bu, annee, mois],
    queryFn: () => plService.getPlBu(bu, annee, mois),
  });

  // Offset for range start: YTD through moisMin-1; subtracted from above to isolate [moisMin, mois]
  const { data: plDataOffset, isLoading: isLoadingOffset } = useQuery({
    queryKey: ['pl-bu', bu, annee, moisMin - 1],
    queryFn: () => plService.getPlBu(bu, annee, moisMin - 1),
    enabled: moisMin > 1,
  });

  if (isLoading || (moisMin > 1 && isLoadingOffset)) {
    return <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>;
  }

  const rows: Row[]       = plData?.data || [];
  const offsetRows: Row[] = moisMin > 1 ? (plDataOffset?.data || []) : [];
  const entityNames = [...new Set(rows.map(r => r.entite))];

  function getRaw(source: Row[], entity: string, line: string, type: string): number {
    return source.find(r => r.entite === entity && r.lignePl === line && r.typeValeur === type)?.montant || 0;
  }

  function getActuals(entity: string, line: string): number {
    return getRaw(rows, entity, line, 'ACTUALS') - getRaw(offsetRows, entity, line, 'ACTUALS');
  }

  function getProratedBudget(entity: string, line: string): number {
    // TARGET stored as annual budget → pro-rate to selected period
    return getRaw(rows, entity, line, 'TARGET') / 12 * nMonths;
  }

  const isYtd   = moisMin === 1;
  const isSingle = moisMin === mois;
  const periodLabel = isYtd
    ? `YTD ${MONTHS_EN[mois - 1]} ${annee}`
    : isSingle
    ? `${MONTHS_EN[mois - 1]} ${annee}`
    : `${MONTHS_EN[moisMin - 1]} – ${MONTHS_EN[mois - 1]} ${annee} · ${nMonths}m`;

  function PlRow({ nom, indent }: { nom: string; indent?: boolean }) {
    const isSubtotal = SUBTOTAL_NOMS.has(nom);
    const isTotal    = TOTAL_NOMS.has(nom);
    const rowBg    = isTotal ? 'bg-indigo-50/50 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/50' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
        <td className={`sticky left-0 px-4 py-2.5 text-gray-700 min-w-56 text-xs ${stickyBg} ${indent ? 'pl-8' : ''}`}>{nom}</td>
        {entityNames.map(e => {
          const actuals  = getActuals(e, nom);
          const target   = getProratedBudget(e, nom);
          const vsBudget = target !== 0 ? (actuals - target) / Math.abs(target) : 0;
          return [
            <td key={`${e}-a`} className="px-2 py-2.5 text-right font-mono border-l border-gray-100 text-gray-800 text-xs">{formatEur(actuals, true)}</td>,
            <td key={`${e}-t`} className="px-2 py-2.5 text-right font-mono text-gray-400 text-xs">{formatEur(target, true)}</td>,
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
        <h2 className="text-base font-bold text-gray-900">Consolidated P&L — {bu.replace('_', ' ')}</h2>
        <p className="text-sm text-gray-400">{periodLabel}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-800">No P&L data for this BU / period</p>
          <p className="text-xs text-amber-600 mt-1">Import an Excel file or enter data via Back-Office</p>
        </div>
      ) : (
        <>
          {/* Main P&L table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 font-semibold text-gray-600 min-w-56">P&L Line</th>
                  {entityNames.map(e => (
                    <th key={e} colSpan={3} className="text-center px-2 py-3 font-semibold text-gray-700 border-l border-gray-200">{e}</th>
                  ))}
                </tr>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-400">
                  <th className="sticky left-0 bg-gray-50/80 px-4 py-2" />
                  {entityNames.flatMap(e => [
                    <th key={`${e}-a`} className="px-2 py-2 text-right border-l border-gray-100 font-medium">Actuals</th>,
                    <th key={`${e}-t`} className="px-2 py-2 text-right font-medium">Budget</th>,
                    <th key={`${e}-v`} className="px-2 py-2 text-right font-medium">vs Bdgt</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {MAIN_PL_LINES.map(l => <PlRow key={l.nom} nom={l.nom} indent={l.indent} />)}
              </tbody>
            </table>
          </div>

          {/* Overhead Detail — collapsible */}
          <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowOverhead(s => !s)}
              className="w-full bg-gray-50 px-4 py-2.5 flex items-center justify-between hover:bg-gray-100 transition-colors text-xs font-bold text-gray-600 uppercase tracking-wide"
            >
              <span>Overhead Detail</span>
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
