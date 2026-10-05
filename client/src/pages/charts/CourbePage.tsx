import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { useFiltersStore } from '../../stores/filters.store';
import { referentielService } from '../../services/referentiel.service';
import { statsService, type MonthlyKpi } from '../../services/stats.service';
import { formatEur } from '../../lib/utils';
import { BU_OPTIONS } from '../../components/layout/ScopeSelector';
import type { ChartsScopeContext } from './ChartsPage';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];
const ALL_BUS = BU_OPTIONS.map(b => b.value);
const BU_LABEL: Record<string, string> = { PROCUREMENT: 'Procurement', FREIGHT_FORWARDING: 'Freight Fwd', LOGISTICS: 'Logistics' };
const SHORT_TO_BU: Record<string, string> = { PROC: 'PROCUREMENT', FF: 'FREIGHT_FORWARDING', LOG: 'LOGISTICS' };
// Palette atténuée pour les courbes individuelles par entité — toujours en arrière-plan de la
// courbe "Total" (bleu nuit, épaisse), jamais en concurrence visuelle avec elle.
const ENTITY_PALETTE = [
  '#94a3b8', '#fca5a5', '#86efac', '#fcd34d', '#c4b5fd', '#67e8f9',
  '#fdba74', '#a5b4fc', '#5eead4', '#f9a8d4', '#bef264', '#7dd3fc',
];

// Version plus sombre de chaque couleur de la palette, utilisée pour la courbe Budget de la même
// entité — même teinte, juste assombrie, pour relier visuellement Actuals et Budget d'une entité
// sans ajouter de couleurs supplémentaires à retenir.
function darken(hex: string, factor = 0.55): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (c: number) => Math.round(c * factor).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}
const ENTITY_PALETTE_DARK = ENTITY_PALETTE.map(c => darken(c));

function mergeMonthly(all: { mois: number; kpis: MonthlyKpi }[][]): { mois: number; kpis: MonthlyKpi }[] {
  const byMonth = new Map<number, MonthlyKpi>();
  for (const series of all) {
    for (const pt of series) {
      const acc = byMonth.get(pt.mois) ?? {};
      for (const [line, vals] of Object.entries(pt.kpis)) {
        acc[line] = acc[line] ?? {};
        for (const [t, v] of Object.entries(vals)) {
          acc[line][t as 'ACTUALS'] = (acc[line][t as 'ACTUALS'] ?? 0) + (v ?? 0);
        }
      }
      byMonth.set(pt.mois, acc);
    }
  }
  return [...byMonth.entries()].map(([mois, kpis]) => ({ mois, kpis })).sort((a, b) => a.mois - b.mois);
}

export default function CourbePage() {
  const { scope } = useOutletContext<ChartsScopeContext>();
  const { annee, entiteId } = useFiltersStore();
  const [selectedLigne, setSelectedLigne] = useState('Revenue');
  // Entité survolée dans la légende — isole sa courbe (et son Budget) pour éviter que toutes les
  // courbes se chevauchent en permanence ; au repos, les courbes par entité restent discrètes.
  const [activeEntite, setActiveEntite] = useState<string | null>(null);

  const isGroup = scope === 'GROUP';
  const { data: entites = [] } = useQuery({
    queryKey: ['entites-trend', isGroup ? 'ALL' : scope],
    queryFn: () => referentielService.getEntites(isGroup ? undefined : scope),
  });
  const selectedEntite = !isGroup && entiteId ? entites.find(e => e.id === entiteId) : undefined;

  const buList = isGroup ? ALL_BUS : [scope];
  const results = useQueries({
    queries: buList.map(b => ({
      queryKey: ['stats', b, annee, 12, isGroup ? undefined : selectedEntite?.id],
      queryFn: () => statsService.getStats(b, annee, 12, isGroup ? undefined : selectedEntite?.id),
    })),
  });

  // Détail par entité — seulement pertinent quand on regarde "toutes les entités" (sinon on est
  // déjà sur une seule entité) : une courbe globale masque les écarts entre entités ; les afficher
  // toutes, avec le Total en évidence, est plus représentatif qu'une seule courbe agrégée.
  const showBreakdown = !selectedEntite;
  const entitesWithBu = entites
    .filter(e => e.actif)
    .map(e => ({ entite: e, buLabel: SHORT_TO_BU[e.bu?.nomCourt ?? ''] ?? scope }));

  const entityResults = useQueries({
    queries: entitesWithBu.map(({ entite, buLabel }) => ({
      queryKey: ['stats-trend', buLabel, annee, entite.id],
      queryFn: () => statsService.getStats(buLabel, annee, 12, entite.id),
      enabled: showBreakdown,
    })),
  });

  const isLoading = results.some(r => r.isLoading) || (showBreakdown && entityResults.some(r => r.isLoading));
  const monthly = mergeMonthly(results.map(r => r.data?.monthly ?? []));

  const entityMonthlyMap: Record<number, { mois: number; kpis: MonthlyKpi }[]> = {};
  entitesWithBu.forEach(({ entite }, i) => {
    entityMonthlyMap[entite.id] = entityResults[i]?.data?.monthly ?? [];
  });

  // Budget annuel de la ligne = somme des TARGET sur tous les mois ÷ 12 (ligne plate)
  function monthlyBudgetFor(series: { mois: number; kpis: MonthlyKpi }[]): number | null {
    const annual = series.reduce((s, m) => s + (m.kpis[selectedLigne]?.TARGET ?? 0), 0);
    return annual !== 0 ? annual / 12 : null;
  }
  const monthlyBudget = monthlyBudgetFor(monthly);
  const totalKey = selectedEntite ? 'Actuals' : 'Total';
  const budgetKeyFor = (nomCourt: string) => `${nomCourt} Budget`;

  const chartData = MONTHS_EN.map((label, i) => {
    const m = monthly.find(x => x.mois === i + 1);
    const point: Record<string, number | string | null> = { name: label };
    point[totalKey] = m?.kpis[selectedLigne]?.ACTUALS ?? null;
    point['Budget / month'] = monthlyBudget;
    if (showBreakdown) {
      for (const { entite } of entitesWithBu) {
        const series = entityMonthlyMap[entite.id] ?? [];
        const em = series.find(x => x.mois === i + 1);
        point[entite.nomCourt] = em?.kpis[selectedLigne]?.ACTUALS ?? null;
        point[budgetKeyFor(entite.nomCourt)] = monthlyBudgetFor(series);
      }
    }
    return point;
  });

  const hasData = chartData.some(d => d[totalKey] !== null && d[totalKey] !== 0);
  const scopeLabel = isGroup ? 'Group' : `${BU_LABEL[scope] ?? scope}${selectedEntite ? ` · ${selectedEntite.nom}` : ' · all entities'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Monthly Trend</h2>
        <div className="flex gap-2">
          {LINES.map(l => (
            <button key={l} onClick={() => setSelectedLigne(l)} className={`px-3 py-1 text-xs rounded-full font-medium transition-all ${selectedLigne === l ? 'bg-[#1B3A6B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{scopeLabel} · {annee}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        {isLoading ? (
          <div className="text-center py-24 text-gray-400 text-sm">Loading…</div>
        ) : !hasData ? (
          <div className="text-center py-24 text-gray-400 text-sm">No monthly data for this scope.</div>
        ) : (
          <ResponsiveContainer width="100%" height={showBreakdown ? 440 : 320}>
            <LineChart data={chartData} margin={{ top: 16, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => formatEur(v, true)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatEur(Number(value))} />
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: showBreakdown ? 'pointer' : 'default' }}
                onMouseEnter={(o) => setActiveEntite(typeof o.value === 'string' ? o.value : null)}
                onMouseLeave={() => setActiveEntite(null)}
              />
              {showBreakdown && entitesWithBu.map(({ entite }, i) => {
                const isActive = activeEntite === entite.nomCourt;
                const isDimmed = activeEntite !== null && !isActive;
                return (
                  <Line
                    key={entite.id}
                    type="monotone"
                    dataKey={entite.nomCourt}
                    name={entite.nomCourt}
                    stroke={ENTITY_PALETTE[i % ENTITY_PALETTE.length]}
                    strokeWidth={isActive ? 2.5 : 1.25}
                    strokeOpacity={isDimmed ? 0.12 : isActive ? 1 : 0.55}
                    dot={false}
                    connectNulls={false}
                  />
                );
              })}
              {showBreakdown && entitesWithBu.map(({ entite }, i) => {
                // Budget par entité affiché seulement au survol de cette entité — sinon 2x le nombre
                // de courbes en permanence rendait le graphique illisible.
                if (activeEntite !== entite.nomCourt) return null;
                return (
                  <Line
                    key={`${entite.id}-budget`}
                    type="monotone"
                    dataKey={budgetKeyFor(entite.nomCourt)}
                    stroke={ENTITY_PALETTE_DARK[i % ENTITY_PALETTE_DARK.length]}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={true}
                    legendType="none"
                  />
                );
              })}
              <Line type="monotone" dataKey={totalKey} stroke="#00A3B4" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false}>
                <LabelList dataKey={totalKey} position="top" formatter={(v) => (v ? formatEur(Number(v), true) : '')} style={{ fontSize: 9, fontWeight: 700, fill: '#0e7490' }} />
              </Line>
              <Line type="monotone" dataKey="Budget / month" stroke="#E8A000" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls={true} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {showBreakdown && hasData && (
        <p className="text-xs text-gray-400 text-center">
          Bold teal = {scopeLabel} total · Dashed amber = Budget / month · Hover a legend entry to isolate that entity's trend and reveal its own Budget (same color, darker)
        </p>
      )}
    </div>
  );
}
