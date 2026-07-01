import { useQueries } from '@tanstack/react-query';
import { plService } from '../../services/pl.service';
import { useFiltersStore } from '../../stores/filters.store';
import { formatEur, formatPct } from '../../lib/utils';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BUS = [
  { key: 'PROCUREMENT', label: 'Procurement', color: '#1B5E8B' },
  { key: 'FREIGHT_FORWARDING', label: 'Freight Fwd', color: '#4A1E8B' },
  { key: 'LOGISTICS', label: 'Logistics', color: '#0E6B5E' },
];
const KEY_LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];

export default function MultiBuPage() {
  const { annee, mois, moisMin } = useFiltersStore();
  const nMonths = mois - moisMin + 1;

  const results = useQueries({
    queries: BUS.map(bu => ({
      queryKey: ['kpi', bu.key, annee, mois],
      queryFn: () => plService.getKpiBu(bu.key, annee, mois),
    })),
  });

  const isLoading = results.some(r => r.isLoading);

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading multi-BU data...</div>;

  const kpisMap = BUS.reduce((acc, bu, i) => {
    acc[bu.key] = results[i].data?.kpis || {};
    return acc;
  }, {} as Record<string, Record<string, Record<string, number>>>);

  function getVal(bu: string, ligne: string, type: string): number {
    return kpisMap[bu]?.[ligne]?.[type] || 0;
  }

  function getProratTarget(bu: string, ligne: string): number {
    return (getVal(bu, ligne, 'TARGET') / 12) * nMonths;
  }

  const totals = KEY_LINES.reduce((acc, ligne) => {
    acc[ligne] = {
      ACTUALS: BUS.reduce((s, bu) => s + getVal(bu.key, ligne, 'ACTUALS'), 0),
      TARGET: BUS.reduce((s, bu) => s + getProratTarget(bu.key, ligne), 0),
    };
    return acc;
  }, {} as Record<string, Record<string, number>>);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Multi-BU Consolidated View</h2>
        <p className="text-sm text-gray-500">YTD {MONTHS_EN[mois - 1]} {annee} - All BUs</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
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
                <th key={bu.key + '-v'} className="px-3 py-2 text-right">vs Bdgt</th>,
              ])}
              <th className="px-3 py-2 text-right border-l border-gray-100">Actuals</th>
              <th className="px-3 py-2 text-right">Target</th>
            </tr>
          </thead>
          <tbody>
            {KEY_LINES.map(ligne => (
              <tr key={ligne} className="border-b border-gray-100 hover:bg-gray-50/50 font-medium">
                <td className="sticky left-0 bg-white px-4 py-2.5 text-gray-800 font-semibold">{ligne}</td>
                {BUS.flatMap(bu => {
                  const act = getVal(bu.key, ligne, 'ACTUALS');
                  const tgt = getProratTarget(bu.key, ligne);
                  const vs = tgt !== 0 ? (act - tgt) / Math.abs(tgt) : 0;
                  const vsStr = tgt !== 0 ? (vs >= 0 ? '+' : '') + formatPct(vs) : '—';
                  return [
                    <td key={bu.key + '-a'} className="px-3 py-2.5 text-right font-mono border-l border-gray-100">{formatEur(act, true)}</td>,
                    <td key={bu.key + '-t'} className="px-3 py-2.5 text-right font-mono text-gray-500">{formatEur(tgt, true)}</td>,
                    <td key={bu.key + '-v'} className={'px-3 py-2.5 text-right font-mono font-semibold ' + (vs >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {vsStr}
                    </td>,
                  ];
                })}
                <td className="px-3 py-2.5 text-right font-mono font-bold border-l border-gray-200 text-gray-900">{formatEur(totals[ligne].ACTUALS, true)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-600">{formatEur(totals[ligne].TARGET, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
