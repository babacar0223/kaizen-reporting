import { useQueries } from '@tanstack/react-query';
import { plService } from '../../services/pl.service';
import { formatEur, formatPct } from '../../lib/utils';

const BUS = [
  { key: 'PROCUREMENT', label: 'Procurement', color: '#1B5E8B' },
  { key: 'FREIGHT_FORWARDING', label: 'Freight Fwd', color: '#6B35B5' },
  { key: 'LOGISTICS', label: 'Logistics', color: '#15857A' },
];
const KEY_LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];

interface Props {
  annee: number;
  mois: number;
  moisMin: number;
  title?: string;
  subtitle?: string;
  showAnalysis?: boolean;
}

// Tableau de synthèse Groupe : lignes P&L clés × 3 BU (Actuals/Target/vs Bdgt) + colonne Group Total.
// Partagé entre l'onglet Figures → Multi-BU et le bas du Dashboard.
export default function MultiBuSynthesisTable({ annee, mois, title, subtitle, showAnalysis = false }: Props) {
  const results = useQueries({
    queries: BUS.map(bu => ({
      queryKey: ['kpi', bu.key, annee, mois],
      queryFn: () => plService.getKpiBu(bu.key, annee, mois),
    })),
  });

  const isLoading = results.some(r => r.isLoading);
  if (isLoading) return <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>;

  const kpisMap = BUS.reduce((acc, bu, i) => {
    acc[bu.key] = results[i].data?.kpis || {};
    return acc;
  }, {} as Record<string, Record<string, Record<string, number>>>);

  function getVal(bu: string, ligne: string, type: string): number {
    return kpisMap[bu]?.[ligne]?.[type] || 0;
  }
  // Budget YTD (fait_pl TARGET) = déjà cumulé jusqu'au mois de référence de chaque entité —
  // à sommer tel quel entre BU, jamais reproratisé par la plage de mois affichée à l'écran.
  const totals = KEY_LINES.reduce((acc, ligne) => {
    acc[ligne] = {
      ACTUALS: BUS.reduce((s, bu) => s + getVal(bu.key, ligne, 'ACTUALS'), 0),
      TARGET: BUS.reduce((s, bu) => s + getVal(bu.key, ligne, 'TARGET'), 0),
    };
    return acc;
  }, {} as Record<string, Record<string, number>>);

  // ── BU comparison ──────────────────────────────────────────────────────
  const grpRev = totals['Revenue'].ACTUALS;
  const grpRevT = totals['Revenue'].TARGET;
  const grpGm = totals['Gross Margin'].ACTUALS;
  const grpEbitda = totals['EBITDA'].ACTUALS;
  const grpNet = totals['Net Earnings'].ACTUALS;

  const buStats = BUS.map(bu => {
    const rev = getVal(bu.key, 'Revenue', 'ACTUALS');
    const revT = getVal(bu.key, 'Revenue', 'TARGET');
    const gm = getVal(bu.key, 'Gross Margin', 'ACTUALS');
    const net = getVal(bu.key, 'Net Earnings', 'ACTUALS');
    return {
      ...bu,
      rev, revT, gm, net,
      mix: grpRev !== 0 ? rev / grpRev : 0,
      achiev: revT !== 0 ? rev / revT : null,
      gmRate: rev !== 0 ? gm / rev : null,
      netShare: grpNet !== 0 ? net / grpNet : 0,
    };
  });
  const withData = buStats.filter(b => b.rev !== 0);
  const topContrib = [...withData].sort((a, b) => b.rev - a.rev)[0];
  const bestAchiev = [...withData].filter(b => b.achiev !== null).sort((a, b) => (b.achiev ?? 0) - (a.achiev ?? 0))[0];
  const worstAchiev = [...withData].filter(b => b.achiev !== null).sort((a, b) => (a.achiev ?? 0) - (b.achiev ?? 0))[0];
  const bestMargin = [...withData].filter(b => b.gmRate !== null).sort((a, b) => (b.gmRate ?? 0) - (a.gmRate ?? 0))[0];
  const grpAchiev = grpRevT !== 0 ? grpRev / grpRevT : null;
  const grpGmRate = grpRev !== 0 ? grpGm / grpRev : null;
  const grpEbitdaRate = grpRev !== 0 ? grpEbitda / grpRev : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {(title || subtitle) && (
        <div className="px-4 pt-4">
          {title && <h2 className="text-sm font-bold text-gray-900">{title}</h2>}
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="overflow-x-auto p-4">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 min-w-44 font-semibold">P&amp;L Line</th>
              {BUS.map(bu => (
                <th key={bu.key} colSpan={3} className="text-center px-3 py-3 font-semibold border-l border-gray-200" style={{ color: bu.color }}>{bu.label}</th>
              ))}
              <th colSpan={2} className="text-center px-3 py-3 font-semibold border-l border-gray-200 text-gray-800">Group Total</th>
            </tr>
            <tr className="bg-gray-50/80 border-b text-gray-500">
              <th className="sticky left-0 bg-gray-50/80 px-4 py-2"></th>
              {BUS.flatMap(bu => [
                <th key={bu.key + '-a'} className="px-3 py-2 text-right border-l border-gray-100">Actuals</th>,
                <th key={bu.key + '-t'} className="px-3 py-2 text-right">Target</th>,
                <th key={bu.key + '-v'} className="px-3 py-2 text-right">Achv</th>,
              ])}
              <th className="px-3 py-2 text-right border-l border-gray-100">Actuals</th>
              <th className="px-3 py-2 text-right">Target</th>
            </tr>
          </thead>
          <tbody>
            {KEY_LINES.map(ligne => {
              // % d'atteinte (Actuals/Budget) plutôt que l'écart restant — cohérent avec Figures →
              // P&L Consolidated. La couleur reste basée sur actuals >= budget (équivalent au signe
              // de l'ancien écart, correct même pour un budget négatif comme EBITDA/Net Earnings).
              const grpGood = totals[ligne].ACTUALS >= totals[ligne].TARGET;
              const grpAchiev = totals[ligne].TARGET !== 0 ? totals[ligne].ACTUALS / totals[ligne].TARGET : null;
              return (
                <tr key={ligne} className="border-b border-gray-100 hover:bg-gray-50/50 font-medium">
                  <td className="sticky left-0 bg-white px-4 py-2.5 text-gray-800 font-semibold">{ligne}</td>
                  {BUS.flatMap(bu => {
                    const act = getVal(bu.key, ligne, 'ACTUALS');
                    const tgt = getVal(bu.key, ligne, 'TARGET');
                    const good = act >= tgt;
                    const achiev = tgt !== 0 ? act / tgt : null;
                    return [
                      <td key={bu.key + '-a'} className="px-3 py-2.5 text-right font-mono border-l border-gray-100">{formatEur(act, true)}</td>,
                      <td key={bu.key + '-t'} className="px-3 py-2.5 text-right font-mono text-gray-500">{formatEur(tgt, true)}</td>,
                      <td key={bu.key + '-v'} className={'px-3 py-2.5 text-right font-mono font-semibold ' + (tgt === 0 ? 'text-gray-300' : good ? 'text-green-600' : 'text-red-600')}>
                        {achiev !== null ? formatPct(achiev) : '—'}
                      </td>,
                    ];
                  })}
                  <td className="px-3 py-2.5 text-right font-mono font-bold border-l border-gray-200 text-gray-900">{formatEur(totals[ligne].ACTUALS, true)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                    {formatEur(totals[ligne].TARGET, true)}
                    {totals[ligne].TARGET !== 0 && (
                      <span className={`block text-[10px] font-semibold ${grpGood ? 'text-green-600' : 'text-red-600'}`}>
                        {grpAchiev !== null ? formatPct(grpAchiev) : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAnalysis && withData.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-3">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">BU comparison</p>

          {/* Mix du chiffre d'affaires */}
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Group revenue mix ({formatEur(grpRev, true)})</p>
            <div className="flex h-4 w-full rounded overflow-hidden bg-gray-200">
              {buStats.filter(b => b.mix > 0).map(b => (
                <div key={b.key} title={`${b.label} · ${formatPct(b.mix)}`}
                  className="flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ width: `${b.mix * 100}%`, backgroundColor: b.color }}>
                  {b.mix >= 0.08 ? formatPct(b.mix) : ''}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Top contributor</p>
              <p className="font-bold" style={{ color: topContrib?.color }}>{topContrib?.label}</p>
              <p className="text-gray-500">{formatPct(topContrib?.mix ?? 0)} of revenue · {formatEur(topContrib?.rev ?? 0, true)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Group budget achievement</p>
              <p className={`font-bold ${grpAchiev !== null && grpAchiev >= 1 ? 'text-green-600' : grpAchiev !== null && grpAchiev >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                {grpAchiev !== null ? formatPct(grpAchiev) : '—'}
              </p>
              <p className="text-gray-500">
                {bestAchiev && `↑ ${bestAchiev.label} ${formatPct(bestAchiev.achiev ?? 0)}`}
                {worstAchiev && bestAchiev && worstAchiev.key !== bestAchiev.key && ` · ↓ ${worstAchiev.label} ${formatPct(worstAchiev.achiev ?? 0)}`}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Gross margin</p>
              <p className="font-bold text-teal-600">{grpGmRate !== null ? formatPct(grpGmRate) : '—'} <span className="text-[10px] text-gray-400 font-normal">Group</span></p>
              <p className="text-gray-500">{bestMargin && `best: ${bestMargin.label} ${formatPct(bestMargin.gmRate ?? 0)}`}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
              <p className="text-[10px] text-gray-400 uppercase font-bold">Profitability</p>
              <p className={`font-bold ${grpNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>EBITDA {grpEbitdaRate !== null ? formatPct(grpEbitdaRate) : '—'}</p>
              <p className="text-gray-500">Group Net Earnings {formatEur(grpNet, true)}</p>
            </div>
          </div>

          {/* Contribution au résultat net */}
          <p className="text-[11px] text-gray-500">
            Contribution to Group Net Earnings —{' '}
            {buStats.map((b, i) => (
              <span key={b.key}>
                {i > 0 && ' · '}
                <span style={{ color: b.color }} className="font-semibold">{b.label}</span> {formatEur(b.net, true)}
                {grpNet !== 0 && ` (${formatPct(b.netShare)})`}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
