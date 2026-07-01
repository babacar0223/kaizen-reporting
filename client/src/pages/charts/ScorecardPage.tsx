import { useQueries } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { plService } from '../../services/pl.service';
import { useFiltersStore } from '../../stores/filters.store';
import { formatEur, formatPct } from '../../lib/utils';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BU_LIST = [
  { key: 'PROCUREMENT', label: 'Procurement', color: '#1B5E8B' },
  { key: 'FREIGHT_FORWARDING', label: 'Freight Fwd', color: '#4A1E8B' },
  { key: 'LOGISTICS', label: 'Logistics', color: '#0E6B5E' },
];

export default function ScorecardPage() {
  const { annee, mois, moisMin } = useFiltersStore();
  const nMonths = mois - moisMin + 1;

  const kpiQueries = useQueries({
    queries: BU_LIST.map(bu => ({
      queryKey: ['kpi', bu.key, annee, mois],
      queryFn: () => plService.getKpiBu(bu.key, annee, mois),
    })),
  });

  const isLoading = kpiQueries.some(q => q.isLoading);

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Loading�</div>;

  const buScores = BU_LIST.map((bu, i) => {
    const kpis = kpiQueries[i].data?.kpis || {};
    const revAct = kpis['Revenue']?.['ACTUALS'] || 0;
    const revTgt = ((kpis['Revenue']?.['TARGET'] || 0) / 12) * nMonths;
    const gmAct = kpis['Gross Margin']?.['ACTUALS'] || 0;
    const ebitda = kpis['EBITDA']?.['ACTUALS'] || 0;
    const vsBudget = revTgt > 0 ? (revAct - revTgt) / Math.abs(revTgt) : 0;
    const gmPct = revAct > 0 ? gmAct / revAct : 0;
    const realisation = revTgt > 0 ? revAct / revTgt : 0;
    const isAlert = realisation < 0.7 && revTgt > 0;

    return { ...bu, revAct, revTgt, gmAct, ebitda, vsBudget, gmPct, realisation, isAlert };
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">BU Scorecard — Synthèse Direction</h2>
        <p className="text-xs text-gray-400">YTD {MONTHS_EN[mois - 1]} {annee}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {buScores.map(bu => (
          <div key={bu.key} className={`bg-white rounded-xl border-2 shadow-sm p-5 ${bu.isAlert ? 'border-red-300' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900" style={{ color: bu.color }}>{bu.label}</h3>
                <p className="text-xs text-gray-400">{MONTHS_EN[mois - 1]} {annee}</p>
              </div>
              {bu.isAlert && <AlertCircle className="w-5 h-5 text-red-500" />}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Revenue YTD</p>
                <p className="text-xl font-bold text-gray-900 font-mono">{formatEur(bu.revAct, true)}</p>
                <div className={`flex items-center gap-1 text-xs font-medium mt-0.5 ${bu.vsBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {bu.vsBudget >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {bu.vsBudget >= 0 ? '+' : ''}{formatPct(bu.vsBudget)} vs Budget
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">GM%</p>
                  <p className="text-sm font-semibold text-gray-800">{formatPct(bu.gmPct)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">EBITDA</p>
                  <p className="text-sm font-semibold text-gray-800">{formatEur(bu.ebitda, true)}</p>
                </div>
              </div>

              {/* Barre réalisation */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Réalisation budget</span>
                  <span className="font-medium">{Math.round(bu.realisation * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(bu.realisation * 100, 100)}%`,
                      backgroundColor: bu.realisation >= 0.9 ? '#107C10' : bu.realisation >= 0.7 ? '#E8A000' : '#C42B1C',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

