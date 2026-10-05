import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatPct } from '../../lib/utils';
import { MAIN_PL_LINES, OVERHEAD_LINES, SUBTOTAL_NOMS, TOTAL_NOMS, formatLineValue } from '../../lib/pl-lines';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type PlRawRow = { mois: number; lignePl: { nom: string }; typeValeur: string; typePeriode: string; montant: number };

interface Props {
  rows: PlRawRow[];
  moisMin: number;
  mois: number;
}

export default function EntityMonthlyTable({ rows, moisMin, mois }: Props) {
  const [showOverhead, setShowOverhead] = useState(false);

  // typePeriode doit TOUJOURS être vérifié en plus de typeValeur : 'ACTUALS' existe à la fois en
  // MTD (valeur mensuelle réelle, ce qu'on veut ici) et en YTD (utilisé par l'ancien import BU
  // Procurement/Freight Forwarding pour une valeur sans rapport). Sans ce filtre, .find() peut
  // retourner cette autre ligne au lieu de la vraie valeur du mois — un mois entier s'affiche
  // alors à tort comme vide.
  function getMtd(nom: string, m: number): number {
    return Number(rows.find(r => r.lignePl.nom === nom && r.mois === m && r.typeValeur === 'ACTUALS' && r.typePeriode === 'MTD')?.montant) || 0;
  }

  // Budget YTD (colonne C du template) = déjà cumulé jusqu'au mois de référence de l'entité,
  // exactement comme YTD N-1 (colonne B) — à utiliser tel quel, jamais reproratisé par la plage
  // de mois sélectionnée à l'écran (moisMin/mois).
  function getBudgetYtd(nom: string): number {
    const targets = rows.filter(r => r.lignePl.nom === nom && r.typeValeur === 'TARGET' && r.typePeriode === 'YTD');
    if (!targets.length) return 0;
    return Number(targets.sort((a, b) => b.mois - a.mois)[0].montant);
  }

  // Valeur de référence N-1 (colonne B du template, année précédente) : une seule ligne
  // attendue par ligne P&L (le serveur la dé-cumule déjà pour les entités consolidées).
  function getYtdN1(nom: string): number {
    const row = rows.find(r => r.lignePl.nom === nom && r.typeValeur === 'YTD_N1' && r.typePeriode === 'YTD');
    return row ? Number(row.montant) : 0;
  }

  function getActuals(nom: string): number {
    let s = 0;
    for (let m = moisMin; m <= mois; m++) s += getMtd(nom, m);
    return s;
  }

  function Row({ nom, indent }: { nom: string; indent?: boolean }) {
    const isSubtotal = SUBTOTAL_NOMS.has(nom);
    const isTotal = TOTAL_NOMS.has(nom);
    const rowBg = isTotal ? 'bg-indigo-50/50 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/50' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    const actuals = getActuals(nom);
    const budget = getBudgetYtd(nom);
    // % d'atteinte (Actuals/Budget) plutôt que l'écart restant — cohérent avec le reste de Figures.
    // Couleur basée sur actuals >= budget, correcte même pour un budget négatif (EBITDA, Net Earnings).
    const achievement = budget !== 0 ? actuals / budget : null;
    const good = actuals >= budget;
    const n1 = getYtdN1(nom);
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/50 ${rowBg}`}>
        <td className={`sticky left-0 px-3 py-2 text-gray-700 text-xs min-w-52 ${stickyBg} ${indent ? 'pl-7' : ''}`}>{nom}</td>
        {MONTHS_EN.map((_, i) => (
          <td key={i} className="px-2 py-2 text-right font-mono text-gray-600 text-xs">{formatLineValue(nom, getMtd(nom, i + 1))}</td>
        ))}
        <td className="px-2 py-2 text-right font-mono font-semibold text-gray-900 text-xs border-l border-gray-100">{formatLineValue(nom, actuals)}</td>
        <td className="px-2 py-2 text-right font-mono text-gray-400 text-xs">{formatLineValue(nom, budget)}</td>
        <td className={`px-2 py-2 text-right font-mono font-semibold text-xs ${budget !== 0 ? (good ? 'text-green-600' : 'text-red-600') : 'text-gray-300'}`}>
          {achievement !== null ? formatPct(achievement) : '—'}
        </td>
        <td className="px-2 py-2 text-right font-mono text-gray-400 text-xs border-l border-gray-100">{n1 ? formatLineValue(nom, n1) : '—'}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 min-w-52 font-semibold">P&amp;L Line</th>
              {MONTHS_EN.map(m => <th key={m} className="px-2 py-2.5 text-right font-semibold">{m}</th>)}
              <th className="px-2 py-2.5 text-right font-semibold border-l border-gray-200">Actuals</th>
              <th className="px-2 py-2.5 text-right font-semibold">Budget</th>
              <th className="px-2 py-2.5 text-right font-semibold">Achievement</th>
              <th className="px-2 py-2.5 text-right font-semibold border-l border-gray-200">N-1</th>
            </tr>
          </thead>
          <tbody>
            {MAIN_PL_LINES.map(l => <Row key={l.nom} nom={l.nom} indent={l.indent} />)}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowOverhead(s => !s)}
          className="w-full bg-gray-50 px-3 py-2 flex items-center justify-between hover:bg-gray-100 transition-colors text-xs font-bold text-gray-600 uppercase tracking-wide"
        >
          <span>Overhead Detail</span>
          {showOverhead ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {showOverhead && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <tbody>
                {OVERHEAD_LINES.map(l => <Row key={l.nom} nom={l.nom} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
