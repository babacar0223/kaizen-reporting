import { useQueries } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { plService } from '../../services/pl.service';
import { formatEur, formatPct } from '../../lib/utils';
import { BU_OPTIONS, type Scope } from '../../components/layout/ScopeSelector';

const ALL_BUS = BU_OPTIONS.map(b => b.value);
const LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];
const BAR_COLORS = ['#1B3A6B', '#00A3B4', '#f59e0b', '#10b981'];

interface Props {
  scope: Scope;
  annee: number;
  mois: number;
}

function growth(a: number, b: number): number | null {
  return b !== 0 ? (a - b) / Math.abs(b) : null;
}

// Comparatif N-1 / N — réutilise plService.getKpiBu (aucun nouvel endpoint), une seule requête par
// BU du périmètre (et pas 3), car le modèle de données ne permet PAS de comparer 3 années distinctes :
// chaque import annuel (FaitPl.annee) ne contient que l'année en cours (ACTUALS/TARGET) + un seul
// instantané de l'année précédente au même mois (YTD_N1, saisi par l'entité). Il n'existe pas de
// colonne "N-2" dans le schéma — interroger `getKpiBu(bu, annee - 1, mois)` ou `(bu, annee - 2, mois)`
// comme le faisait l'ancienne version de ce composant renvoie toujours 0 (aucune ligne FaitPl n'a
// `annee` = une année passée : l'historique y est bien présent, mais sous forme de YTD_N1 imbriqué
// dans l'année en cours, pas sous sa propre `annee`).
export default function YearComparison({ scope, annee, mois }: Props) {
  const bus = scope === 'GROUP' ? ALL_BUS : [scope];
  const priorYear = annee - 1;

  const results = useQueries({
    queries: bus.map(b => ({
      queryKey: ['kpi', b, annee, mois],
      queryFn: () => plService.getKpiBu(b, annee, mois),
    })),
  });

  const isLoading = results.some(r => r.isLoading);

  function valFor(line: string, type: 'ACTUALS' | 'YTD_N1'): number {
    return results.reduce((sum, r) => sum + (r.data?.kpis?.[line]?.[type] || 0), 0);
  }

  const rows = LINES.map(line => ({ line, n1: valFor(line, 'YTD_N1'), n: valFor(line, 'ACTUALS') }));
  const chartData = [
    { annee: String(priorYear), ...Object.fromEntries(LINES.map(l => [l, valFor(l, 'YTD_N1')])) },
    { annee: String(annee), ...Object.fromEntries(LINES.map(l => [l, valFor(l, 'ACTUALS')])) },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-bold text-gray-800 mb-1">Comparaison N-1 / N</h2>
      <p className="text-xs text-gray-400 mb-4">
        YTD au même mois ({priorYear} · {annee}) — {priorYear} tel que déclaré par chaque entité (instantané N-1, pas un import indépendant)
      </p>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Chargement du comparatif…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left pb-2 font-semibold">Indicateur</th>
                  <th className="text-right pb-2 font-semibold">{priorYear}</th>
                  <th className="text-right pb-2 font-semibold">{annee}</th>
                  <th className="text-right pb-2 font-semibold">N-1→N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => {
                  const g = growth(r.n, r.n1);
                  return (
                    <tr key={r.line}>
                      <td className="py-2.5 text-gray-700 font-medium">{r.line}</td>
                      <td className="py-2.5 text-right font-mono text-gray-800">{formatEur(r.n1, true)}</td>
                      <td className="py-2.5 text-right font-mono text-gray-800">{formatEur(r.n, true)}</td>
                      <td className={`py-2.5 text-right font-mono font-semibold ${g === null ? 'text-gray-300' : g >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {g !== null ? `${g >= 0 ? '+' : ''}${formatPct(g)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatEur(Number(v), true)} width={70} />
              <Tooltip formatter={(v) => formatEur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {LINES.map((line, i) => (
                <Bar key={line} dataKey={line} fill={BAR_COLORS[i]} radius={[3, 3, 0, 0]}>
                  <LabelList dataKey={line} position="top" formatter={(v) => formatEur(Number(v), true)} style={{ fontSize: 8, fill: '#6b7280' }} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
