import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { formatEur } from '../../lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MAIN_PL_LINES, OVERHEAD_LINES, SUBTOTAL_NOMS, TOTAL_NOMS } from '../../lib/pl-lines';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Row = { mois: number; lignePl: { nom: string }; typeValeur: string; typePeriode: string; montant: number };

function aggregateRows(allEntityRows: Row[][]): Row[] {
  const mtdMap = new Map<string, Row>();
  const ytdMap = new Map<string, Row>();

  for (const entityRows of allEntityRows) {
    for (const r of entityRows) {
      const m = Number(r.montant); // Prisma Decimal serialise en string → forcer en number
      if (r.typePeriode === 'YTD') {
        const k = `${r.lignePl.nom}|${r.typeValeur}`;
        const ex = ytdMap.get(k);
        if (ex) {
          ex.montant += m;
        } else {
          ytdMap.set(k, { ...r, montant: m, mois: 12 });
        }
      } else {
        const k = `${r.mois}|${r.lignePl.nom}|${r.typeValeur}`;
        const ex = mtdMap.get(k);
        if (ex) {
          ex.montant += m;
        } else {
          mtdMap.set(k, { ...r, montant: m });
        }
      }
    }
  }

  return [...mtdMap.values(), ...ytdMap.values()];
}

export default function MensuelPage() {
  const { bu, annee, entiteId } = useFiltersStore();
  const [showOverhead, setShowOverhead] = useState(false);

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', bu],
    queryFn: () => referentielService.getEntites(bu),
  });

  const selectedEntite = entiteId ? entites.find(e => e.id === entiteId) : null;
  const isAll = !selectedEntite;

  // Single entity
  const { data: singleData, isLoading: loadingSingle } = useQuery({
    queryKey: ['pl-entite-mensuel', bu, selectedEntite?.id, annee],
    queryFn: () => plService.getPlEntite(bu, selectedEntite!.id, annee, 12),
    enabled: !!selectedEntite?.id,
  });

  // All entities aggregate
  const { data: allData, isLoading: loadingAll } = useQuery({
    queryKey: ['pl-all-mensuel', bu, annee, entites.map(e => e.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        entites.map(e => plService.getPlEntite(bu, e.id, annee, 12).then((r: any) => (r as { data?: Row[] })?.data ?? []))
      );
      return aggregateRows(results);
    },
    enabled: isAll && entites.length > 0,
  });

  const isLoading = isAll ? loadingAll : loadingSingle;
  const rows: Row[] = isAll
    ? (allData ?? [])
    : ((singleData as { data?: Row[] })?.data ?? []);

  function getMtd(ligne: string, mois: number): number {
    return Number(rows.find(r => r.lignePl.nom === ligne && r.mois === mois && r.typeValeur === 'ACTUALS')?.montant) || 0;
  }

  function getBudget(ligne: string): number {
    const ytdTargets = rows.filter(r => r.lignePl.nom === ligne && r.typeValeur === 'TARGET');
    if (!ytdTargets.length) return 0;
    return Number(ytdTargets.sort((a, b) => b.mois - a.mois)[0].montant);
  }

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>;

  const subtitle = isAll
    ? `All entities · ${annee}`
    : `${selectedEntite?.nom} · ${annee}`;

  function TableRow({ nom, indent }: { nom: string; indent?: boolean }) {
    const isSubtotal = SUBTOTAL_NOMS.has(nom);
    const isTotal    = TOTAL_NOMS.has(nom);
    const rowBg    = isTotal ? 'bg-indigo-50/50 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/50' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    const budget = getBudget(nom);
    const total  = MONTHS_EN.reduce((s, _, i) => s + getMtd(nom, i + 1), 0);
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
        <td className={`sticky left-0 px-4 py-2 text-gray-700 text-xs min-w-56 ${stickyBg} ${indent ? 'pl-8' : ''}`}>{nom}</td>
        <td className="px-3 py-2 text-right font-mono text-gray-400 text-xs">{budget ? formatEur(budget, true) : '—'}</td>
        {MONTHS_EN.map((_, i) => {
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
        <h2 className="text-base font-bold text-gray-900">Monthly View (XPFA)</h2>
        <p className="text-sm text-gray-400">{subtitle}</p>
      </div>

      {/* Main P&L table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 min-w-56 font-semibold">P&L Line</th>
              <th className="px-3 py-3 text-right font-semibold">Budget YTD</th>
              {MONTHS_EN.map(m => (
                <th key={m} className="px-3 py-3 text-right font-semibold">{m}</th>
              ))}
              <th className="px-3 py-3 text-right font-semibold">Total {annee}</th>
            </tr>
          </thead>
          <tbody>
            {MAIN_PL_LINES.map(l => <TableRow key={l.nom} nom={l.nom} indent={l.indent} />)}
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
                {OVERHEAD_LINES.map(l => <TableRow key={l.nom} nom={l.nom} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
