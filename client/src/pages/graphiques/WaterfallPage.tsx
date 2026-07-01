import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { formatEur, moisLabel } from '../../lib/utils';

const STEPS = [
  { label: 'Revenue', from: 'Revenue', positive: true },
  { label: '− COS', from: 'Cost of Sales', positive: false },
  { label: 'Gross Margin', from: 'Gross Margin', isSolde: true },
  { label: '− Overheads', from: 'Overheads', positive: false },
  { label: 'EBITDA', from: 'EBITDA', isSolde: true },
  { label: '− M.Fees', from: 'Management Fees', positive: false },
  { label: 'Net Earnings', from: 'Net Earnings', isSolde: true },
];

export default function WaterfallPage() {
  const { bu, annee, mois } = useFiltersStore();

  const { data, isLoading } = useQuery({
    queryKey: ['kpi', bu, annee, mois],
    queryFn: () => plService.getKpiBu(bu, annee, mois),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500 text-sm">Chargement...</div>;

  const kpis = data?.kpis || {};
  const revenue = kpis['Revenue']?.['ACTUALS'] || 0;

  let running = 0;
  const chartData = STEPS.map(step => {
    const val = kpis[step.from]?.['ACTUALS'] || 0;
    if (step.isSolde) {
      const bar = val;
      running = val;
      return { name: step.label, value: bar, base: 0, isSolde: true, pct: revenue > 0 ? val / revenue : 0 };
    } else {
      const base = step.positive ? running : running - Math.abs(val);
      const bar = Math.abs(val);
      running = step.positive ? running + val : running - Math.abs(val);
      return { name: step.label, value: bar, base, isSolde: false, positive: step.positive, pct: revenue > 0 ? Math.abs(val) / revenue : 0 };
    }
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Cascade P&L (Waterfall)</h2>
        <p className="text-xs text-gray-400">BU {bu} · YTD {moisLabel(mois)} {annee}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => formatEur(v, true)} tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow p-3 text-xs">
                    <p className="font-semibold text-gray-800">{d.name}</p>
                    <p className="text-gray-600">{formatEur(d.value)}</p>
                    <p className="text-gray-400">{(d.pct * 100).toFixed(1)}% du Revenue</p>
                  </div>
                );
              }}
            />
            {/* Barre transparente pour le décalage */}
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="value" stackId="a" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.isSolde ? '#00A3B4' : entry.positive ? '#107C10' : '#C42B1C'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
