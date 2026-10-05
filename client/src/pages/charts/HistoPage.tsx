import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Info } from 'lucide-react';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { formatEur, formatPct } from '../../lib/utils';
import { BU_OPTIONS } from '../../components/layout/ScopeSelector';
import type { ChartsScopeContext } from './ChartsPage';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LIGNES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];
const COLORS = { ACTUALS: '#00A3B4', TARGET: '#E8A000', YTD_N1: '#94a3b8' };
const ALL_BUS = BU_OPTIONS.map(b => b.value);
const BU_LABEL: Record<string, string> = { PROCUREMENT: 'Procurement', FREIGHT_FORWARDING: 'Freight Forwarding', LOGISTICS: 'Logistics' };

interface EntityBar { name: string; Actuals: number; Target: number; 'N-1': number }
interface Sentence { en: string; fr: string }

const LIGNE_FR: Record<string, string> = { Revenue: "Chiffre d'affaires", 'Gross Margin': 'Marge brute', EBITDA: 'EBITDA', 'Net Earnings': 'Résultat net' };

// Analyse automatique des écarts par entité pour la ligne sélectionnée — même esprit que les
// "Key Insights" de Statistics, mais autonome (pas de dépendance à l'analyse pluriannuelle de cette page).
// Chaque phrase est produite en anglais ET en français depuis les mêmes valeurs calculées, pour un
// affichage bilingue sans dupliquer la logique.
function buildAnalysis(chartData: EntityBar[], ligne: string) {
  const ligneFr = LIGNE_FR[ligne] ?? ligne;
  const withData = chartData.filter(d => d.Actuals !== 0 || d.Target !== 0);
  if (withData.length === 0) return { totalActuals: 0, totalTarget: 0, totalAchievement: null as number | null, totalGrowth: null as number | null, sentences: [] as Sentence[] };

  const totalActuals = withData.reduce((s, d) => s + d.Actuals, 0);
  const totalTarget = withData.reduce((s, d) => s + d.Target, 0);
  const totalN1 = withData.reduce((s, d) => s + d['N-1'], 0);
  const totalAchievement = totalTarget !== 0 ? totalActuals / totalTarget : null;
  const totalGrowth = totalN1 !== 0 ? (totalActuals - totalN1) / Math.abs(totalN1) : null;

  const withBudget = withData.filter(d => d.Target !== 0).map(d => ({ ...d, gap: (d.Actuals - d.Target) / Math.abs(d.Target) }));
  const above = withBudget.filter(d => d.Actuals >= d.Target);
  const below = withBudget.filter(d => d.Actuals < d.Target);
  const byGapAsc = [...withBudget].sort((a, b) => a.gap - b.gap);
  const worst = byGapAsc[0];
  const best = byGapAsc[byGapAsc.length - 1];

  const withGrowth = withData.filter(d => d['N-1'] !== 0).map(d => ({ ...d, growth: (d.Actuals - d['N-1']) / Math.abs(d['N-1']) }));
  const byGrowthDesc = [...withGrowth].sort((a, b) => b.growth - a.growth);
  const topGrower = byGrowthDesc[0];
  const topDecliner = byGrowthDesc[byGrowthDesc.length - 1];

  const sentences: Sentence[] = [];

  if (totalAchievement !== null) {
    sentences.push({
      en: `Total ${ligne} for this scope is ${formatEur(totalActuals, true)} vs a Budget of ${formatEur(totalTarget, true)} — ${totalAchievement >= 1 ? 'an achievement of' : 'a shortfall to'} ${formatPct(totalAchievement)}.`,
      fr: `Le total ${ligneFr} de ce périmètre est de ${formatEur(totalActuals, true)} contre un Budget de ${formatEur(totalTarget, true)} — soit ${totalAchievement >= 1 ? 'une réalisation de' : 'un écart de'} ${formatPct(totalAchievement)}.`,
    });
  }
  if (withBudget.length > 0) {
    sentences.push({
      en: `${above.length} of ${withBudget.length} entities are at or above budget; ${below.length} are below.`,
      fr: `${above.length} entité(s) sur ${withBudget.length} atteignent ou dépassent le budget ; ${below.length} sont en-dessous.`,
    });
  }
  if (best && (!worst || best.name !== worst.name)) {
    sentences.push({
      en: `${best.name} leads with ${best.gap >= 0 ? '+' : ''}${formatPct(best.gap)} vs budget.`,
      fr: `${best.name} est en tête avec ${best.gap >= 0 ? '+' : ''}${formatPct(best.gap)} vs budget.`,
    });
  }
  if (worst && worst.gap < 0) {
    sentences.push({
      en: `${worst.name} shows the largest gap to budget, at ${formatPct(worst.gap)}.`,
      fr: `${worst.name} présente le plus grand écart au budget, à ${formatPct(worst.gap)}.`,
    });
  }
  if (totalGrowth !== null) {
    sentences.push({
      en: `Vs the same period last year, total ${ligne} is ${totalGrowth >= 0 ? 'up' : 'down'} ${formatPct(Math.abs(totalGrowth))}.`,
      fr: `Par rapport à la même période l'an dernier, le total ${ligneFr} est en ${totalGrowth >= 0 ? 'hausse' : 'baisse'} de ${formatPct(Math.abs(totalGrowth))}.`,
    });
  }
  if (topGrower && topGrower.growth > 0 && (!topDecliner || topGrower.name !== topDecliner.name)) {
    sentences.push({
      en: `${topGrower.name} grew the most year-over-year, at +${formatPct(topGrower.growth)}.`,
      fr: `${topGrower.name} enregistre la plus forte croissance sur un an, à +${formatPct(topGrower.growth)}.`,
    });
  }
  if (topDecliner && topDecliner.growth < 0) {
    sentences.push({
      en: `${topDecliner.name} declined the most year-over-year, at ${formatPct(topDecliner.growth)}.`,
      fr: `${topDecliner.name} enregistre la plus forte baisse sur un an, à ${formatPct(topDecliner.growth)}.`,
    });
  }

  return { totalActuals, totalTarget, totalAchievement, totalGrowth, sentences };
}

export default function HistoPage() {
  const { scope } = useOutletContext<ChartsScopeContext>();
  const { annee, mois, moisMin } = useFiltersStore();
  const [selectedLigne, setSelectedLigne] = useState('Revenue');
  const bus = scope === 'GROUP' ? ALL_BUS : [scope];

  const results = useQueries({
    queries: bus.map(b => ({
      queryKey: ['pl-bu', b, annee, mois],
      queryFn: () => plService.getPlBu(b, annee, mois),
    })),
  });

  if (results.some(r => r.isLoading)) return <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>;

  const rows = results.flatMap(r => r.data?.data || []);
  const entites = [...new Set(rows.map((r: any) => r.entite))];

  // Budget YTD (typeValeur='TARGET') = déjà cumulé jusqu'au mois de référence de l'entité, comme
  // YTD N-1 — à afficher tel quel, jamais reproratisé par la plage de mois sélectionnée à l'écran.
  // Les entités filles d'un groupe consolidé (ex. Local/International Procurement) sont déjà
  // fusionnées sous le nom de l'entité mère côté serveur (getPlBu) — un seul bar par entité réelle.
  const chartData: EntityBar[] = entites.map(e => ({
    name: e,
    Actuals: (rows as any[]).find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'ACTUALS')?.montant || 0,
    Target: (rows as any[]).find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'TARGET')?.montant || 0,
    'N-1': (rows as any[]).find(r => r.entite === e && r.lignePl === selectedLigne && r.typeValeur === 'YTD_N1')?.montant || 0,
  }));

  const analysis = buildAnalysis(chartData, selectedLigne);
  const scopeLabel = scope === 'GROUP' ? 'Group (all BUs)' : BU_LABEL[scope] ?? scope;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-base font-semibold text-gray-800">Actuals vs Target vs Prior Year</h2>
        <div className="flex gap-2 ml-4">
          {LIGNES.map(l => (
            <button
              key={l}
              onClick={() => setSelectedLigne(l)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${selectedLigne === l ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {moisMin > 1 ? `${MONTHS_EN[moisMin - 1]}–${MONTHS_EN[mois - 1]}` : `YTD ${MONTHS_EN[mois - 1]}`} {annee}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => formatEur(v, true)} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => formatEur(Number(value))} />
            {/* Ordre explicite — sans ça la légende de Recharts ne suit pas toujours l'ordre de
                déclaration des <Bar> (les <Cell>/<LabelList> imbriqués perturbent sa détection).
                `content` reçoit le payload auto-généré par Recharts, qu'on ne fait que réordonner. */}
            <Legend
              content={({ payload }) => {
                const order = ['Actuals', 'Target', 'N-1'];
                const sorted = order
                  .map(key => payload?.find(p => p.value === key))
                  .filter((p): p is NonNullable<typeof p> => !!p);
                return (
                  <ul className="flex justify-center gap-4 text-xs" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {sorted.map((entry, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                        {entry.value}
                      </li>
                    ))}
                  </ul>
                );
              }}
            />
            <Bar dataKey="Actuals" fill={COLORS.ACTUALS} radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.Actuals >= entry.Target ? '#107C10' : '#C42B1C'}
                />
              ))}
              <LabelList dataKey="Actuals" position="top" formatter={(v) => formatEur(Number(v), true)} style={{ fontSize: 9, fontWeight: 700, fill: '#374151' }} />
            </Bar>
            <Bar dataKey="Target" fill={COLORS.TARGET} radius={[3, 3, 0, 0]}>
              <LabelList dataKey="Target" position="top" formatter={(v) => formatEur(Number(v), true)} style={{ fontSize: 8, fill: '#9ca3af' }} />
            </Bar>
            <Bar dataKey="N-1" fill={COLORS.YTD_N1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Green = Actuals &gt; Target · Red = Actuals &lt; Target · Target/N-1 as reported YTD by each entity
        <br />
        Vert = Actuals &gt; Budget · Rouge = Actuals &lt; Budget · Budget/N-1 tels que déclarés en YTD par chaque entité
      </p>

      {/* ── Explanation + auto analysis — anglais puis traduction française en dessous ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-1.5">
            <Info className="w-4 h-4 text-[#1B3A6B]" />
            What this chart shows
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            For each entity in the <strong>{scopeLabel}</strong> scope, this compares <strong>Actuals</strong> achieved over
            the selected period against its <strong>Budget</strong> (YTD, as reported by the entity up to its reference
            month — not reprorated to the selected range) and the <strong>same period last year</strong> ("N-1"). A bar
            turns green when Actuals meet or exceed Budget, red otherwise. Sub-entities of a consolidated entity (e.g.
            Afrilog International's Local and International Procurement books) are summed into a single bar for their
            parent entity.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-2 pt-2 border-t border-gray-100">
            Pour chaque entité du périmètre <strong>{scopeLabel}</strong>, ce graphique compare les <strong>Actuals</strong>{' '}
            réalisés sur la période sélectionnée à son <strong>Budget</strong> (YTD, tel que déclaré par l'entité jusqu'à
            son mois de référence — non reproratisé selon la plage sélectionnée) et à la <strong>même période l'an
            dernier</strong> (« N-1 »). Une barre devient verte quand les Actuals atteignent ou dépassent le Budget, rouge
            sinon. Les sous-entités d'une entité consolidée (ex. les activités Local et International Procurement
            d'Afrilog International) sont regroupées en une seule barre pour leur entité mère.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">Analysis — {selectedLigne}</h3>
          {analysis.sentences.length > 0 ? (
            <ul className="space-y-1.5">
              {analysis.sentences.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-[#00A3B4] font-bold mt-0.5">•</span>
                  <span>{s.en}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Not enough data to generate an analysis for this selection.</p>
          )}

          <h3 className="text-sm font-bold text-gray-800 mb-2 mt-4 pt-3 border-t border-gray-100">
            Analyse — {LIGNE_FR[selectedLigne] ?? selectedLigne}
          </h3>
          {analysis.sentences.length > 0 ? (
            <ul className="space-y-1.5">
              {analysis.sentences.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-[#00A3B4] font-bold mt-0.5">•</span>
                  <span>{s.fr}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">Pas assez de données pour générer une analyse pour cette sélection.</p>
          )}
        </div>
      </div>
    </div>
  );
}
