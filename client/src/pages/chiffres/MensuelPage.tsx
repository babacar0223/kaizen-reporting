import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { formatEur, MOIS_FR } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MAIN_PL_LINES, OVERHEAD_LINES, SUBTOTAL_NOMS, TOTAL_NOMS } from '../../lib/pl-lines';

type Row = { mois: number; lignePl: { nom: string }; typeValeur: string; typePeriode: string; montant: number };

export default function MensuelPage() {
  const { bu, annee, entiteId } = useFiltersStore();
  const [showOverhead, setShowOverhead] = useState(false);

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', bu],
    queryFn: () => referentielService.getEntites(bu),
  });

  const selectedEntite = entiteId ? entites.find(e => e.id === entiteId) : entites[0];

  const { data, isLoading } = useQuery({
    queryKey: ['pl-entite-mensuel', bu, selectedEntite?.id, annee],
    queryFn: () => plService.getPlEntite(bu, selectedEntite!.id, annee, 12),
    enabled: !!selectedEntite?.id,
  });

  const rows: Row[] = (data as { data?: Row[] })?.data || [];

  function getMtd(ligne: string, mois: number): number {
    return Number(rows.find(r => r.lignePl.nom === ligne && r.mois === mois && r.typePeriode === 'MTD' && r.typeValeur === 'ACTUALS')?.montant) || 0;
  }

  function getBudget(ligne: string): number {
    return Number(rows.find(r => r.lignePl.nom === ligne && r.typePeriode === 'ANNUAL_BUDGET')?.montant) || 0;
  }

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Chargement...</div>;

  function LigneRow({ nom, indent }: { nom: string; indent?: boolean }) {
    const isSubtotal = SUBTOTAL_NOMS.has(nom);
    const isTotal    = TOTAL_NOMS.has(nom);
    const rowBg    = isTotal ? 'bg-indigo-50/50 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/50' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    const budget = getBudget(nom);
    const total  = MOIS_FR.reduce((s, _, i) => s + getMtd(nom, i + 1), 0);
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
        <td className={`sticky left-0 px-4 py-2 text-gray-700 text-xs min-w-56 ${stickyBg} ${indent ? 'pl-8' : ''}`}>{nom}</td>
        <td className="px-3 py-2 text-right font-mono text-gray-500 text-xs">{budget ? formatEur(budget, true) : '—'}</td>
        {MOIS_FR.map((_, i) => {
          const val = getMtd(nom, i + 1);
          return (
            <td key={i} className="px-3 py-2 text-right font-mono text-gray-800 text-xs">
              {val ? formatEur(val, true) : '—'}
            </td>
          );
        })}
        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900 text-xs">
          {total ? formatEur(total, true) : '—'}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Vue Mensuelle (XPFA)</h2>
        <p className="text-sm text-gray-500">{selectedEntite?.nom} · {annee}</p>
      </div>

      {/* P&L principal */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 min-w-56 font-semibold">Ligne P&L</th>
              <th className="px-3 py-3 text-right font-semibold">Budget YTD</th>
              {MOIS_FR.map(m => (
                <th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>
              ))}
              <th className="px-3 py-3 text-right font-semibold">Total {annee}</th>
            </tr>
          </thead>
          <tbody>
            {MAIN_PL_LINES.map(l => <LigneRow key={l.nom} nom={l.nom} indent={l.indent} />)}
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
                {OVERHEAD_LINES.map(l => <LigneRow key={l.nom} nom={l.nom} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
