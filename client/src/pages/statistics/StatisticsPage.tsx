import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Area, ReferenceLine, LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info, Users, FileBarChart, Download, Loader2 } from 'lucide-react';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';
import { statsService, type MonthlyKpi, type StatsResponse } from '../../services/stats.service';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { salesService } from '../../services/sales.service';
import { formatEur, formatPct } from '../../lib/utils';
import PageFilters from '../../components/layout/PageFilters';
import ScopeSelector, { BU_OPTIONS, type Scope } from '../../components/layout/ScopeSelector';
import YearComparison from './YearComparison';
import {
  exportStatisticsReportPdf, type KpiLine, type EntityKpi, type RatioLine, type YoyLine,
  type ClientFocusRow, type ClientGroupRow,
} from '../../lib/figuresPdf';

const ALL_BUS = BU_OPTIONS.map(b => b.value);
const REPORT_SHORT_TO_BU: Record<string, string> = { PROC: 'PROCUREMENT', FF: 'FREIGHT_FORWARDING', LOG: 'LOGISTICS' };
const KEY_LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];

function kv(kpis: Record<string, Record<string, number>>, label: string, type: string): number {
  return kpis[label]?.[type] || 0;
}

function toKpiLine(label: string, kpis: Record<string, Record<string, number>>): KpiLine {
  const actuals = kv(kpis, label, 'ACTUALS');
  const budget = kv(kpis, label, 'TARGET');
  const achievement = budget !== 0 ? actuals / budget : null;
  return { label, actuals, budget, achievement };
}

function mergeMonthlyKpi(list: MonthlyKpi[]): MonthlyKpi {
  const out: MonthlyKpi = {};
  for (const kpi of list) {
    for (const [line, vals] of Object.entries(kpi)) {
      if (!out[line]) out[line] = {};
      for (const [type, v] of Object.entries(vals)) {
        const t = type as 'ACTUALS' | 'TARGET' | 'YTD_N1';
        out[line][t] = (out[line][t] || 0) + (v || 0);
      }
    }
  }
  return out;
}

// Fusionne les réponses getStats des 3 BU en une seule vue "Groupe" (même forme, consommée sans changement par le reste de la page)
function mergeStats(responses: StatsResponse[]): StatsResponse {
  const ytd = mergeMonthlyKpi(responses.map(r => r.ytd));
  const nMonths = Math.max(0, ...responses.map(r => r.monthly.length));
  const monthly = Array.from({ length: nMonths }, (_, i) => {
    const mois = i + 1;
    const kpisList = responses.map(r => r.monthly.find(m => m.mois === mois)?.kpis).filter((k): k is MonthlyKpi => !!k);
    return { mois, kpis: mergeMonthlyKpi(kpisList) };
  });
  const entities = responses.flatMap(r => r.entities);
  return { bu: 'GROUP', annee: responses[0]?.annee ?? 0, mois: responses[0]?.mois ?? 0, monthly, ytd, entities };
}

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const COLORS = { ACTUALS: '#1B3A6B', TARGET: '#00A3B4', YTD_N1: '#94a3b8' };

function get(kpi: MonthlyKpi, line: string, type: 'ACTUALS' | 'TARGET' | 'YTD_N1'): number {
  return kpi[line]?.[type] ?? 0;
}

function rate(num: number, den: number): number | null {
  return den !== 0 ? num / den : null;
}

function delta(a: number, b: number): number | null {
  return b !== 0 ? (a - b) / Math.abs(b) : null;
}

function pp(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? (a - b) * 100 : null;
}

const KPI_PALETTES = [
  { grad: 'from-[#1B3A6B] to-[#1B5E8B]', light: 'bg-blue-50',    icon: '💰' },
  { grad: 'from-[#0E6B5E] to-[#15857A]', light: 'bg-emerald-50', icon: '📊' },
  { grad: 'from-[#B45309] to-[#D97706]', light: 'bg-amber-50',   icon: '⚡' },
  { grad: 'from-[#6B21A8] to-[#9333EA]', light: 'bg-purple-50',  icon: '🎯' },
];

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ title, value, rate: rateVal, vsBudget, vsN1, idx = 0 }: {
  title: string; value: number; rate?: number | null;
  vsBudget?: number | null; vsN1?: number | null; idx?: number;
}) {
  const pal = KPI_PALETTES[idx % KPI_PALETTES.length];
  const sign = (v: number) => v >= 0 ? '+' : '';
  const budgetOk = vsBudget != null && vsBudget >= -0.02;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-br ${pal.grad} px-4 pt-4 pb-6`}>
        <div className="flex items-start justify-between">
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest">{title}</p>
          <span className="text-lg">{pal.icon}</span>
        </div>
        <p className="text-white text-2xl font-black mt-2 leading-tight">{formatEur(value, true)}</p>
        {rateVal != null && (
          <p className="text-white/60 text-xs mt-1">{formatPct(rateVal)} of revenue</p>
        )}
      </div>
      <div className={`px-4 py-3 -mt-2 rounded-t-xl ${pal.light} space-y-2`}>
        {vsBudget != null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">vs Budget</span>
            <span className={`font-bold ${budgetOk ? 'text-green-700' : vsBudget >= -0.1 ? 'text-amber-700' : 'text-red-600'}`}>
              {sign(vsBudget)}{formatPct(vsBudget)}
            </span>
          </div>
        )}
        {vsN1 != null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500 font-medium">vs Prior Year</span>
            <span className={`font-bold ${vsN1 >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
              {sign(vsN1)}{formatPct(vsN1)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insight item ────────────────────────────────────────────────────────────
function Insight({ text, type }: { text: string; type: 'good' | 'warn' | 'bad' | 'info' }) {
  const cfg = {
    good: { icon: CheckCircle, cls: 'text-green-600 bg-green-50 border-green-200' },
    warn: { icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 border-amber-200' },
    bad:  { icon: TrendingDown, cls: 'text-red-600 bg-red-50 border-red-200' },
    info: { icon: Info, cls: 'text-blue-600 bg-blue-50 border-blue-200' },
  }[type];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${cfg.cls}`}>
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <p className="text-sm leading-snug">{text}</p>
    </div>
  );
}

// ─── Budget bar ──────────────────────────────────────────────────────────────
function BudgetBar({ label, actuals, target }: { label: string; actuals: number; target: number }) {
  const pct = target !== 0 ? Math.min(Math.abs(actuals / target), 1.5) : 0;
  const achieved = target !== 0 ? actuals / target : 0;
  const color = achieved >= 1 ? 'bg-green-500' : achieved >= 0.85 ? 'bg-amber-400' : 'bg-red-400';
  const sign = achieved >= 1 ? '+' : '';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 font-medium truncate max-w-[60%]">{label}</span>
        <span className={`font-bold ${achieved >= 1 ? 'text-green-700' : achieved >= 0.85 ? 'text-amber-700' : 'text-red-700'}`}>
          {target !== 0 ? `${sign}${formatPct(achieved - 1)}` : '—'}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct * 100 / 1.5}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{formatEur(actuals, true)}</span>
        <span>Target: {formatEur(target, true)}</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StatisticsPage() {
  const { bu, annee, mois, entiteId, setBu } = useFiltersStore();
  const { user } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';
  const [scope, setScope] = useState<Scope>(bu as Scope);

  function handleScopeChange(s: Scope) {
    setScope(s);
    if (s !== 'GROUP') setBu(s); // garde le sélecteur Entité de PageFilters cohérent avec la BU choisie
  }

  // ── Full Analytical Report (custom BU + date range, independent of the page's global filters) ──
  const isViewerRestrictedBu = isViewer && !!user?.buAccess?.length;
  const reportBuOptions = [
    ...(isViewerRestrictedBu ? [] : [{ value: 'GROUP', label: 'Group (all BUs)' }]),
    ...(isViewerRestrictedBu ? BU_OPTIONS.filter(b => user!.buAccess!.includes(b.value)) : BU_OPTIONS),
  ];
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBu, setReportBu] = useState<string>(isViewerRestrictedBu ? reportBuOptions[0]?.value ?? scope : 'GROUP');
  const [reportAnnee, setReportAnnee] = useState(annee);
  const [reportFrom, setReportFrom] = useState(1);
  const [reportTo, setReportTo] = useState(mois);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  async function handleGenerateReport() {
    setReportGenerating(true);
    setReportError(null);
    try {
      const buList = reportBu === 'GROUP' ? ALL_BUS : [reportBu];

      // Consolidé du périmètre choisi (indépendant des filtres globaux de la page)
      const buResults = await Promise.all(
        buList.map(b => plService.getKpiBu(b, reportAnnee, reportTo, undefined, reportFrom)),
      );
      const mergedKpis: Record<string, Record<string, number>> = {};
      for (const res of buResults) {
        for (const [line, vals] of Object.entries(res.kpis || {})) {
          mergedKpis[line] = mergedKpis[line] || {};
          for (const [tv, v] of Object.entries(vals)) {
            mergedKpis[line][tv] = (mergedKpis[line][tv] || 0) + (v as number);
          }
        }
      }

      // Entités du périmètre, chacune avec sa propre BU (nécessaire pour le périmètre Group, qui couvre les 3 BU)
      const allEntites = await referentielService.getEntites(reportBu === 'GROUP' ? undefined : reportBu);
      const entitesWithBu = allEntites
        .filter(e => e.actif)
        .map(e => ({ entite: e, buLabel: REPORT_SHORT_TO_BU[e.bu?.nomCourt ?? ''] ?? reportBu }));

      const perEntity: EntityKpi[] = await Promise.all(
        entitesWithBu.map(async ({ entite, buLabel }) => {
          const res = await plService.getKpiBu(buLabel, reportAnnee, reportTo, entite.id, reportFrom);
          const kpis = res.kpis || {};
          return {
            nom: entite.nom,
            nomCourt: entite.nomCourt,
            lines: KEY_LINES.map(label => toKpiLine(label, kpis)),
          };
        }),
      );
      perEntity.sort((a, b) => (b.lines[0]?.actuals ?? 0) - (a.lines[0]?.actuals ?? 0));

      const consolidated: KpiLine[] = KEY_LINES.map(label => toKpiLine(label, mergedKpis));
      const revLine = consolidated.find(l => l.label === 'Revenue')!;
      const gmLine = consolidated.find(l => l.label === 'Gross Margin')!;
      const ebitdaLine = consolidated.find(l => l.label === 'EBITDA')!;
      const netLine = consolidated.find(l => l.label === 'Net Earnings')!;
      const cosLine = toKpiLine('Cost of Sales', mergedKpis);
      const overheadsLine = toKpiLine('Overheads', mergedKpis);

      const ratioOf = (num: KpiLine): { actuals: number | null; target: number | null } => ({
        actuals: revLine.actuals !== 0 ? num.actuals / revLine.actuals : null,
        target: revLine.budget !== 0 ? num.budget / revLine.budget : null,
      });
      // Postes de coût : ratio exprimé en valeur absolue (poids dans le revenu), "lowerIsBetter"
      // inversé par rapport aux marges (moins de coût relatif = meilleure performance).
      const costRatioOf = (num: KpiLine): { actuals: number | null; target: number | null } => ({
        actuals: revLine.actuals !== 0 ? Math.abs(num.actuals) / Math.abs(revLine.actuals) : null,
        target: revLine.budget !== 0 ? Math.abs(num.budget) / Math.abs(revLine.budget) : null,
      });
      const ratios: RatioLine[] = [
        { label: 'Gross Margin %', ...ratioOf(gmLine) },
        { label: 'EBITDA %', ...ratioOf(ebitdaLine) },
        { label: 'Net Earnings %', ...ratioOf(netLine) },
        { label: 'Cost of Sales % of Revenue', ...costRatioOf(cosLine), lowerIsBetter: true },
        { label: 'Overheads % of Revenue', ...costRatioOf(overheadsLine), lowerIsBetter: true },
      ];

      const yoyOf = (label: string): YoyLine => {
        const current = kv(mergedKpis, label, 'ACTUALS');
        const prior = kv(mergedKpis, label, 'YTD_N1');
        return { label, current, prior, growth: delta(current, prior) };
      };
      const yoy: YoyLine[] = KEY_LINES.map(yoyOf).filter(l => l.current !== 0 || l.prior !== 0);

      // ── Focus Clients : détail par client + groupe de consolidation (Admin > Groupes clients),
      // agrégé sur toutes les entités du périmètre. Utilise le mois de fin choisi comme référence
      // YTD, comme getClientsOverview le fait déjà ailleurs dans la plateforme.
      let clientsFocus: { topClients: ClientFocusRow[]; groups: ClientGroupRow[] } | undefined;
      try {
        const clientResponses = await Promise.all(buList.map(b => salesService.getClientsOverview(b, reportAnnee, reportTo)));
        const clientMap = new Map<string, { clientNom: string; groupe: string; revenue: number; margin: number; revTarget: number }>();
        for (const resp of clientResponses) {
          for (const row of resp.clients) {
            const agg = clientMap.get(row.clientNom) ?? { clientNom: row.clientNom, groupe: row.groupe, revenue: 0, margin: 0, revTarget: 0 };
            agg.revenue += row.revActual;
            agg.margin += row.gmActual;
            agg.revTarget += row.revTarget;
            if (agg.groupe === 'Others' && row.groupe !== 'Others') agg.groupe = row.groupe;
            clientMap.set(row.clientNom, agg);
          }
        }
        const allClients = [...clientMap.values()].sort((a, b) => b.revenue - a.revenue);
        const topClients: ClientFocusRow[] = allClients.slice(0, 10).map(c => ({
          clientNom: c.clientNom,
          groupe: c.groupe,
          revenue: c.revenue,
          margin: c.margin,
          marginRate: c.revenue !== 0 ? c.margin / c.revenue : null,
          achievement: c.revTarget !== 0 ? c.revenue / c.revTarget : null,
        }));

        const groupMap = new Map<string, { groupe: string; revenue: number; margin: number }>();
        for (const c of allClients) {
          const g = groupMap.get(c.groupe) ?? { groupe: c.groupe, revenue: 0, margin: 0 };
          g.revenue += c.revenue;
          g.margin += c.margin;
          groupMap.set(c.groupe, g);
        }
        const totalClientRevenue = allClients.reduce((s, c) => s + c.revenue, 0);
        const groups: ClientGroupRow[] = [...groupMap.values()]
          .map(g => ({
            groupe: g.groupe,
            revenue: g.revenue,
            share: totalClientRevenue !== 0 ? g.revenue / totalClientRevenue : 0,
            margin: g.margin,
            marginRate: g.revenue !== 0 ? g.margin / g.revenue : null,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        clientsFocus = { topClients, groups };
      } catch {
        clientsFocus = undefined; // module Clients non alimenté pour ce périmètre : section omise, pas bloquant
      }

      const insights: string[] = [];
      const revVsBdg = revLine.achievement !== null ? revLine.achievement - 1 : null;
      if (revVsBdg !== null) {
        if (revVsBdg >= 0.05) insights.push(`Revenue is ${formatPct(revVsBdg)} above budget — strong commercial momentum.`);
        else if (revVsBdg >= -0.05) insights.push(`Revenue is broadly on track (${formatPct(Math.abs(revVsBdg))} ${revVsBdg >= 0 ? 'above' : 'below'} budget).`);
        else if (revVsBdg >= -0.15) insights.push(`Revenue is ${formatPct(Math.abs(revVsBdg))} below budget — monitor pipeline closely.`);
        else insights.push(`Revenue is ${formatPct(Math.abs(revVsBdg))} below budget — corrective action required.`);
      }
      const revGrowth = yoy.find(l => l.label === 'Revenue')?.growth ?? null;
      if (revGrowth !== null) {
        insights.push(`Revenue ${revGrowth >= 0 ? 'grew' : 'declined'} ${formatPct(Math.abs(revGrowth))} year-over-year.`);
      }
      const gmRatio = ratios.find(r => r.label === 'Gross Margin %')!;
      if (gmRatio.actuals !== null) {
        const ppDelta = gmRatio.target !== null ? (gmRatio.actuals - gmRatio.target) * 100 : null;
        const ppStr = ppDelta !== null ? ` (${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)}pp vs budget)` : '';
        insights.push(`Gross margin at ${formatPct(gmRatio.actuals)}${ppStr}.`);
      }
      const ebitdaRatio = ratios.find(r => r.label === 'EBITDA %')!;
      if (ebitdaRatio.actuals !== null && ebitdaRatio.target !== null) {
        const ppDelta = (ebitdaRatio.actuals - ebitdaRatio.target) * 100;
        insights.push(`EBITDA margin at ${formatPct(ebitdaRatio.actuals)} — ${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)}pp vs target.`);
      }
      if (netLine.achievement !== null) {
        insights.push(`Net Earnings achievement at ${formatPct(netLine.achievement)} of budget.`);
      }
      const cosRatio = ratios.find(r => r.label === 'Cost of Sales % of Revenue')!;
      if (cosRatio.actuals !== null && cosRatio.target !== null) {
        const ppDelta = (cosRatio.actuals - cosRatio.target) * 100;
        insights.push(`Cost of Sales absorbs ${formatPct(cosRatio.actuals)} of Revenue — ${ppDelta <= 0 ? ppDelta.toFixed(1) : `+${ppDelta.toFixed(1)}`}pp vs budget.`);
      }

      if (perEntity.length > 0) {
        const top = perEntity[0];
        const topRevenue = top.lines[0]?.actuals ?? 0;
        const topShare = revLine.actuals !== 0 ? topRevenue / revLine.actuals : 0;
        insights.push(`Top-contributing entity: ${top.nom} with ${formatEur(topRevenue, true)} in revenue (${formatPct(topShare)} of the scope total).`);
      }
      if (perEntity.length > 1) {
        const withEbitdaAch = perEntity
          .map(e => ({ nom: e.nom, ach: e.lines[2]?.achievement ?? null }))
          .filter((e): e is { nom: string; ach: number } => e.ach !== null);
        if (withEbitdaAch.length > 1) {
          const best = withEbitdaAch.reduce((a, b) => (b.ach > a.ach ? b : a));
          const worst = withEbitdaAch.reduce((a, b) => (b.ach < a.ach ? b : a));
          if (best.nom !== worst.nom) {
            insights.push(`${best.nom} leads on EBITDA achievement (${formatPct(best.ach)} of budget); ${worst.nom} lags at ${formatPct(worst.ach)}.`);
          }
        }
      }
      if (clientsFocus && clientsFocus.topClients.length > 0) {
        const totalClientRevenue = clientsFocus.groups.reduce((s, g) => s + g.revenue, 0);
        const top = clientsFocus.topClients[0];
        const topShare = totalClientRevenue !== 0 ? top.revenue / totalClientRevenue : 0;
        insights.push(
          `Largest tracked client: ${top.clientNom} (${top.groupe}) at ${formatEur(top.revenue, true)}, ${formatPct(topShare)} of client revenue` +
          `${topShare >= 0.25 ? ' — notable concentration risk' : ''}.`
        );
        if (clientsFocus.groups.length > 1) {
          const topGroup = clientsFocus.groups[0];
          insights.push(`${topGroup.groupe} is the leading client group at ${formatPct(topGroup.share)} of tracked client revenue.`);
        }
      }

      const scopeLabel = reportBu === 'GROUP' ? 'Group (all BUs)' : (BU_OPTIONS.find(o => o.value === reportBu)?.label ?? reportBu);
      const periodLabel = reportFrom === 1
        ? `YTD ${MONTHS_EN[reportTo - 1]} ${reportAnnee}`
        : `${MONTHS_EN[reportFrom - 1]} - ${MONTHS_EN[reportTo - 1]} ${reportAnnee}`;

      await exportStatisticsReportPdf({
        orgName: 'CSTT AO',
        scopeLabel,
        periodLabel,
        consolidated,
        entities: perEntity,
        ratios,
        yoy,
        clients: clientsFocus,
        insights,
      });
    } catch {
      setReportError('Report generation failed. Please check the selected range and try again.');
    } finally {
      setReportGenerating(false);
    }
  }

  const groupQueries = useQueries({
    queries: ALL_BUS.map(b => ({
      queryKey: ['stats', b, annee, mois],
      queryFn: () => statsService.getStats(b, annee, mois),
      enabled: scope === 'GROUP',
    })),
  });
  const singleQuery = useQuery({
    queryKey: ['stats', scope, annee, mois, entiteId],
    queryFn: () => statsService.getStats(scope, annee, mois, entiteId),
    enabled: scope !== 'GROUP',
  });

  const isLoading = scope === 'GROUP' ? groupQueries.some(q => q.isLoading) : singleQuery.isLoading;
  const data = scope === 'GROUP'
    ? (groupQueries.every(q => q.data) ? mergeStats(groupQueries.map(q => q.data!)) : undefined)
    : singleQuery.data;

  const analysis = useMemo(() => {
    if (!data) return null;
    const ytd = data.ytd;

    // Core values
    const rev = get(ytd, 'Revenue', 'ACTUALS');
    const revT = get(ytd, 'Revenue', 'TARGET');
    const revN1 = get(ytd, 'Revenue', 'YTD_N1');
    const gm = get(ytd, 'Gross Margin', 'ACTUALS');
    const gmT = get(ytd, 'Gross Margin', 'TARGET');
    const ebitda = get(ytd, 'EBITDA', 'ACTUALS');
    const ebitdaT = get(ytd, 'EBITDA', 'TARGET');
    const netEarnings = get(ytd, 'Net Earnings', 'ACTUALS');
    const netT = get(ytd, 'Net Earnings', 'TARGET');
    const netN1 = get(ytd, 'Net Earnings', 'YTD_N1');
    const overheads = get(ytd, 'Overheads', 'ACTUALS');
    const overheadsT = get(ytd, 'Overheads', 'TARGET');
    const cos = get(ytd, 'Cost of Sales', 'ACTUALS');
    const cosT = get(ytd, 'Cost of Sales', 'TARGET');

    // Rates
    const gmRate = rate(gm, rev);
    const gmRateT = rate(gmT, revT);
    const ebitdaRate = rate(ebitda, rev);
    const ebitdaRateT = rate(ebitdaT, revT);
    const netRate = rate(netEarnings, rev);
    const cosRate = rate(cos, rev);
    const cosRateT = rate(cosT, revT);

    // Monthly trend chart data
    const trendData = data.monthly.map(m => ({
      month: MONTHS_EN[m.mois - 1],
      Revenue: get(m.kpis, 'Revenue', 'ACTUALS') || null,
      Target: get(m.kpis, 'Revenue', 'TARGET') || null,
      'Prior Year': get(m.kpis, 'Revenue', 'YTD_N1') || null,
    }));

    // Margin rate evolution
    const marginData = data.monthly.map(m => {
      const r = get(m.kpis, 'Revenue', 'ACTUALS');
      return {
        month: MONTHS_EN[m.mois - 1],
        'GM%': r ? +(rate(get(m.kpis, 'Gross Margin', 'ACTUALS'), r)! * 100).toFixed(1) : null,
        'EBITDA%': r ? +(rate(get(m.kpis, 'EBITDA', 'ACTUALS'), r)! * 100).toFixed(1) : null,
        'Net%': r ? +(rate(get(m.kpis, 'Net Earnings', 'ACTUALS'), r)! * 100).toFixed(1) : null,
      };
    });

    // Budget achievement lines
    const budgetLines = [
      { label: 'Revenue', actuals: rev, target: revT },
      { label: 'Gross Margin', actuals: gm, target: gmT },
      { label: 'EBITDA', actuals: ebitda, target: ebitdaT },
      { label: 'Net Earnings', actuals: netEarnings, target: netT },
      { label: 'Overheads', actuals: overheads, target: overheadsT },
    ].filter(l => l.target !== 0 || l.actuals !== 0);

    // Entity data for ranking
    const entityData = data.entities
      .map(e => ({
        nom: e.nom,
        revenue: get(e.kpis, 'Revenue', 'ACTUALS'),
        ebitda: get(e.kpis, 'EBITDA', 'ACTUALS'),
        netEarnings: get(e.kpis, 'Net Earnings', 'ACTUALS'),
        ebitdaRate: rate(get(e.kpis, 'EBITDA', 'ACTUALS'), get(e.kpis, 'Revenue', 'ACTUALS')),
      }))
      .filter(e => e.revenue !== 0 || e.ebitda !== 0)
      .sort((a, b) => b.revenue - a.revenue);

    // Best month by revenue
    const bestMonth = data.monthly.reduce((best, m) => {
      const r = get(m.kpis, 'Revenue', 'ACTUALS');
      return r > (best ? get(best.kpis, 'Revenue', 'ACTUALS') : 0) ? m : best;
    }, data.monthly[0]);

    // Last 3 months trend (accelerating?)
    const last3 = data.monthly.slice(-3).map(m => get(m.kpis, 'Revenue', 'ACTUALS'));
    const isAccelerating = last3.length >= 2 && last3[last3.length - 1] > last3[0];

    // Auto insights
    const insights: { text: string; type: 'good' | 'warn' | 'bad' | 'info' }[] = [];

    const revVsBdg = delta(rev, revT);
    if (revVsBdg !== null) {
      if (revVsBdg >= 0.05) insights.push({ text: `Revenue is ${formatPct(revVsBdg)} above budget — strong commercial momentum.`, type: 'good' });
      else if (revVsBdg >= -0.05) insights.push({ text: `Revenue is broadly on track (${formatPct(Math.abs(revVsBdg))} ${revVsBdg >= 0 ? 'above' : 'below'} budget).`, type: 'info' });
      else if (revVsBdg >= -0.15) insights.push({ text: `Revenue is ${formatPct(Math.abs(revVsBdg))} below budget — monitor pipeline closely.`, type: 'warn' });
      else insights.push({ text: `Revenue is ${formatPct(Math.abs(revVsBdg))} below budget — corrective action required.`, type: 'bad' });
    }

    const revVsN1 = delta(rev, revN1);
    if (revVsN1 !== null) {
      const verb = revVsN1 >= 0 ? 'grew' : 'declined';
      insights.push({ text: `Revenue ${verb} ${formatPct(Math.abs(revVsN1))} year-over-year.`, type: revVsN1 >= 0 ? 'good' : 'warn' });
    }

    if (gmRate !== null) {
      const ppDelta = pp(gmRate, gmRateT);
      const ppStr = ppDelta !== null ? ` (${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)}pp vs budget)` : '';
      if (gmRate >= 0.35) insights.push({ text: `Gross margin at ${formatPct(gmRate)}${ppStr} — solid value creation.`, type: ppDelta !== null && ppDelta < -2 ? 'warn' : 'good' });
      else if (gmRate >= 0.20) insights.push({ text: `Gross margin at ${formatPct(gmRate)}${ppStr} — within acceptable range.`, type: 'info' });
      else insights.push({ text: `Gross margin at ${formatPct(gmRate)}${ppStr} — pricing or cost pressure detected.`, type: 'bad' });
    }

    if (ebitdaRate !== null && ebitdaRateT !== null) {
      const ppDelta = pp(ebitdaRate, ebitdaRateT);
      if (ppDelta !== null) {
        if (ppDelta >= 1) insights.push({ text: `EBITDA margin at ${formatPct(ebitdaRate)} — ${ppDelta.toFixed(1)}pp above target.`, type: 'good' });
        else if (ppDelta >= -1) insights.push({ text: `EBITDA margin at ${formatPct(ebitdaRate)} — in line with target.`, type: 'info' });
        else insights.push({ text: `EBITDA margin at ${formatPct(ebitdaRate)} — ${Math.abs(ppDelta).toFixed(1)}pp below target.`, type: ppDelta < -3 ? 'bad' : 'warn' });
      }
    }

    const cosVsBdg = delta(cos, cosT);
    if (cosVsBdg !== null && cosRate !== null && cosRateT !== null) {
      const cosRateDelta = pp(cosRate, cosRateT);
      if (cosRateDelta !== null && cosRateDelta > 2) {
        insights.push({ text: `Cost of Sales ratio is ${cosRateDelta.toFixed(1)}pp above budget — review procurement costs.`, type: 'warn' });
      }
    }

    if (bestMonth) {
      insights.push({ text: `Best month so far: ${MONTHS_EN[bestMonth.mois - 1]} with ${formatEur(get(bestMonth.kpis, 'Revenue', 'ACTUALS'), true)} in revenue.`, type: 'info' });
    }

    if (isAccelerating && last3.length >= 2) {
      insights.push({ text: 'Revenue trend is accelerating over the last 3 months — positive momentum.', type: 'good' });
    } else if (!isAccelerating && last3.length >= 2 && last3[0] > 0) {
      insights.push({ text: 'Revenue has been declining over the last 3 months — investigate.', type: 'warn' });
    }

    return {
      rev, revT, revN1, gm, gmT, ebitda, ebitdaT, netEarnings, netT, netN1,
      gmRate, gmRateT, ebitdaRate, ebitdaRateT, netRate,
      trendData, marginData, budgetLines, entityData, insights,
      revVsBdg: delta(rev, revT),
      revVsN1: delta(rev, revN1),
      ebitdaVsBdg: delta(ebitda, ebitdaT),
      netVsBdg: delta(netEarnings, netT),
    };
  }, [data]);

  // ── Stats lines from imported template ──
  const staffNumber    = data ? (get(data.ytd, 'Staff Number', 'ACTUALS') || 0) : 0;
  const nominalTaxRate = data ? (get(data.ytd, 'Nominal Income Tax Rate (%)', 'ACTUALS') || 0) : 0;
  const avgVatRate     = data ? (get(data.ytd, 'Average VAT Rate (%)', 'ACTUALS') || 0) : 0;
  const gmPerStaff     = data ? (get(data.ytd, 'Gross Margin per Staff', 'ACTUALS') || 0) : 0;
  const costPerStaff   = data ? (get(data.ytd, 'Operating Cost per Staff', 'ACTUALS') || 0) : 0;
  const hasStatsLines  = staffNumber !== 0 || nominalTaxRate !== 0 || avgVatRate !== 0;

  // Monthly staff trend
  const staffTrend = data?.monthly.map(m => ({
    month: MONTHS_EN[m.mois - 1],
    staff: get(m.kpis, 'Staff Number', 'ACTUALS') || null,
    gmPerStaff: get(m.kpis, 'Gross Margin per Staff', 'ACTUALS') || null,
  })) ?? [];

  const header = (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Financial Statistics</h1>
          <span className="text-xs bg-[#1B3A6B]/10 text-[#1B3A6B] font-semibold px-3 py-1 rounded-full">Deep Analysis</span>
        </div>
        <ScopeSelector value={scope} onChange={handleScopeChange} />
      </div>
      <PageFilters showEntity={scope !== 'GROUP'} showBu={false} />
    </>
  );

  // Panneau autonome : périmètre + plage de dates propres au rapport, indépendants des filtres
  // globaux de la page — rendu dans les 3 branches (loading / vide / données) pour rester utilisable
  // même quand la sélection globale courante n'a pas de données.
  const reportPanel = (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <button onClick={() => setReportOpen(o => !o)} className="w-full flex items-center justify-between text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <span className="w-5 h-5 bg-[#B45309] rounded flex items-center justify-center">
            <FileBarChart className="w-3 h-3 text-white" />
          </span>
          Full Analytical Report
        </span>
        <span className="text-xs text-gray-400">
          {reportOpen ? 'Hide' : 'Generate a decision-ready PDF for a chosen scope & date range'}
        </span>
      </button>
      {reportOpen && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">Scope</label>
              <select
                value={reportBu}
                onChange={e => setReportBu(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
              >
                {reportBuOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Year</label>
              <input
                type="number"
                value={reportAnnee}
                onChange={e => setReportAnnee(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">From month</label>
              <select
                value={reportFrom}
                onChange={e => { const v = Number(e.target.value); setReportFrom(v); if (v > reportTo) setReportTo(v); }}
                className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
              >
                {MONTHS_EN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">To month</label>
              <select
                value={reportTo}
                onChange={e => { const v = Number(e.target.value); setReportTo(v); if (v < reportFrom) setReportFrom(v); }}
                className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
              >
                {MONTHS_EN.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          {reportError && <p className="text-xs text-red-600">{reportError}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleGenerateReport}
              disabled={reportGenerating}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-[#1B3A6B] to-[#1B5E8B] text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm hover:shadow-md transition-shadow disabled:opacity-60"
            >
              {reportGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {reportGenerating ? 'Generating…' : 'Generate Full Report (PDF)'}
            </button>
            <p className="text-xs text-gray-400">
              Budget/Target figures are YTD as imported (cumulative to each entity's reference month), not prorated to the chosen range.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        {reportPanel}
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Loading analysis…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis || (analysis.rev === 0 && analysis.gm === 0)) {
    return (
      <div className="space-y-6">
        {header}
        {reportPanel}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
            <TrendingUp className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium">No data available for this selection</p>
          <p className="text-sm text-gray-400 mt-1">Import P&amp;L data or adjust the filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div>{header}</div>

      {reportPanel}

      {/* ── Section 1: KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard idx={0} title="Revenue" value={analysis.rev} vsBudget={analysis.revVsBdg} vsN1={analysis.revVsN1} />
        <KpiCard idx={1} title="Gross Margin" value={analysis.gm} rate={analysis.gmRate}
          vsBudget={analysis.gmT ? delta(analysis.gm, analysis.gmT) : null} />
        <KpiCard idx={2} title="EBITDA" value={analysis.ebitda} rate={analysis.ebitdaRate}
          vsBudget={analysis.ebitdaVsBdg} />
        <KpiCard idx={3} title="Net Earnings" value={analysis.netEarnings} rate={analysis.netRate}
          vsBudget={analysis.netVsBdg} vsN1={analysis.netN1 ? delta(analysis.netEarnings, analysis.netN1) : null} />
      </div>

      {/* ── Section 2: Trend + Margin ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Monthly Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={analysis.trendData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatEur(v, true)} width={70} />
              <Tooltip formatter={(v) => formatEur(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Revenue" stroke={COLORS.ACTUALS} strokeWidth={2.5} dot={{ r: 3 }} connectNulls>
                <LabelList dataKey="Revenue" position="top" formatter={(v) => (v ? formatEur(Number(v), true) : '')} style={{ fontSize: 9, fontWeight: 700, fill: COLORS.ACTUALS }} />
              </Line>
              <Line type="monotone" dataKey="Target" stroke={COLORS.TARGET} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="Prior Year" stroke={COLORS.YTD_N1} strokeWidth={1.5} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Margin Rate Evolution */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Margin Rate Evolution (%)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={analysis.marginData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} width={45} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#e5e7eb" />
              <Area type="monotone" dataKey="GM%" stroke="#10b981" fill="#d1fae5" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="EBITDA%" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="Net%" stroke={COLORS.ACTUALS} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 3: Budget Achievement + Key Ratios ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Budget Achievement */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-5">Budget Achievement</h2>
          <div className="space-y-4">
            {analysis.budgetLines.map(l => (
              <BudgetBar key={l.label} label={l.label} actuals={l.actuals} target={l.target} />
            ))}
          </div>
        </div>

        {/* Key Ratios */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Key Financial Ratios</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left pb-2 font-semibold">Ratio</th>
                <th className="text-right pb-2 font-semibold">Actuals</th>
                <th className="text-right pb-2 font-semibold">Target</th>
                <th className="text-right pb-2 font-semibold">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                { label: 'Gross Margin %', a: analysis.gmRate, t: analysis.gmRateT },
                { label: 'EBITDA %', a: analysis.ebitdaRate, t: analysis.ebitdaRateT },
                { label: 'Net Earnings %', a: analysis.netRate, t: null },
              ].map(r => {
                const ppGap = pp(r.a, r.t);
                return (
                  <tr key={r.label}>
                    <td className="py-2.5 text-gray-700 font-medium">{r.label}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-gray-900">{r.a !== null ? formatPct(r.a) : '—'}</td>
                    <td className="py-2.5 text-right font-mono text-gray-400">{r.t !== null ? formatPct(r.t) : '—'}</td>
                    <td className={`py-2.5 text-right font-mono font-semibold ${ppGap === null ? 'text-gray-300' : ppGap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {ppGap !== null ? `${ppGap >= 0 ? '+' : ''}${ppGap.toFixed(1)}pp` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* YoY comparison mini-table */}
          {(analysis.revN1 > 0 || analysis.netN1 > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Year-over-Year</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Revenue growth</p>
                  <p className={`text-base font-bold ${(analysis.revVsN1 ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {analysis.revVsN1 !== null ? `${(analysis.revVsN1 ?? 0) >= 0 ? '+' : ''}${formatPct(analysis.revVsN1!)}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Net earnings growth</p>
                  <p className={`text-base font-bold ${(delta(analysis.netEarnings, analysis.netN1) ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {analysis.netN1 ? `${(delta(analysis.netEarnings, analysis.netN1) ?? 0) >= 0 ? '+' : ''}${formatPct(delta(analysis.netEarnings, analysis.netN1) ?? 0)}` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Entity Ranking (ADMIN+) ── */}
      {!isViewer && analysis.entityData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Entity Performance Ranking</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="text-left pb-2 font-semibold">#</th>
                  <th className="text-left pb-2 font-semibold">Entity</th>
                  <th className="text-right pb-2 font-semibold">Revenue</th>
                  <th className="text-right pb-2 font-semibold">EBITDA</th>
                  <th className="text-right pb-2 font-semibold">EBITDA%</th>
                  <th className="text-right pb-2 font-semibold">Net Earnings</th>
                  <th className="pb-2 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {analysis.entityData.map((e, i) => {
                  const totalRev = analysis.rev;
                  const share = totalRev > 0 ? e.revenue / totalRev : 0;
                  return (
                    <tr key={e.nom} className="hover:bg-gray-50/50">
                      <td className="py-2.5 text-gray-400 font-bold text-xs">#{i + 1}</td>
                      <td className="py-2.5 font-semibold text-gray-800">{e.nom}</td>
                      <td className="py-2.5 text-right font-mono text-gray-700">{formatEur(e.revenue, true)}</td>
                      <td className={`py-2.5 text-right font-mono font-semibold ${e.ebitda >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatEur(e.ebitda, true)}</td>
                      <td className={`py-2.5 text-right font-mono text-xs ${(e.ebitdaRate ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {e.ebitdaRate !== null ? formatPct(e.ebitdaRate) : '—'}
                      </td>
                      <td className={`py-2.5 text-right font-mono ${e.netEarnings >= 0 ? 'text-gray-700' : 'text-red-600'}`}>{formatEur(e.netEarnings, true)}</td>
                      <td className="py-2.5 pl-3">
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-[#1B3A6B] h-1.5 rounded-full" style={{ width: `${share * 100}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 text-right mt-0.5">{formatPct(share)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={2} className="py-2.5 px-0 font-bold text-gray-800 text-sm">Total</td>
                  <td className="py-2.5 text-right font-mono font-bold text-gray-900">{formatEur(analysis.rev, true)}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-green-700">{formatEur(analysis.ebitda, true)}</td>
                  <td className="py-2.5 text-right font-mono text-xs font-bold text-green-600">{analysis.ebitdaRate !== null ? formatPct(analysis.ebitdaRate) : '—'}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-gray-900">{formatEur(analysis.netEarnings, true)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mini bar chart of entity revenues */}
          <div className="mt-5">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={analysis.entityData.slice(0, 10)} margin={{ top: 0, right: 10, bottom: 20, left: 0 }}>
                <XAxis dataKey="nom" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatEur(Number(v), true)} />
                <Bar dataKey="revenue" fill="#1B3A6B" radius={[3, 3, 0, 0]} name="Revenue">
                  <LabelList dataKey="revenue" position="top" formatter={(v) => formatEur(Number(v), true)} style={{ fontSize: 8, fontWeight: 700, fill: '#1B3A6B' }} />
                </Bar>
                <Bar dataKey="ebitda" fill="#00A3B4" radius={[3, 3, 0, 0]} name="EBITDA">
                  <LabelList dataKey="ebitda" position="top" formatter={(v) => formatEur(Number(v), true)} style={{ fontSize: 8, fill: '#0e7490' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Section 5: Staff & Rates (from template import) ── */}
      {hasStatsLines && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* KPI chips */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 bg-[#0E6B5E] rounded flex items-center justify-center">
                <Users className="w-3 h-3 text-white" />
              </span>
              Staff & Fiscal Rates
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Staff Number',         value: staffNumber !== 0 ? Math.round(staffNumber).toLocaleString('fr-FR') : '—', sub: 'employees', color: 'bg-blue-50 text-blue-700', big: true },
                { label: 'GM / Staff',            value: gmPerStaff !== 0 ? formatEur(gmPerStaff, true) : '—', sub: 'per person', color: 'bg-emerald-50 text-emerald-700', big: false },
                { label: 'Nominal Tax Rate',      value: nominalTaxRate !== 0 ? (nominalTaxRate * 100).toFixed(1) + '%' : '—', sub: 'income tax', color: 'bg-purple-50 text-purple-700', big: false },
                { label: 'Average VAT Rate',      value: avgVatRate !== 0 ? (avgVatRate * 100).toFixed(1) + '%' : '—', sub: 'blended', color: 'bg-amber-50 text-amber-700', big: false },
                { label: 'Op. Cost / Staff',      value: costPerStaff !== 0 ? formatEur(costPerStaff, true) : '—', sub: 'per person', color: 'bg-red-50 text-red-700', big: false },
              ].map(card => (
                <div key={card.label} className={`${card.color} rounded-xl p-3`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{card.label}</p>
                  <p className={`font-black mt-1 ${card.big ? 'text-2xl' : 'text-lg'}`}>{card.value}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Staff trend chart */}
          {staffTrend.some(d => d.staff !== null) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-bold text-gray-800 mb-4">Staff & GM per Staff — Monthly</h2>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={staffTrend} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => formatEur(v, true)} width={70} />
                  <Tooltip formatter={(v, name) => name === 'staff' ? [v, 'Staff'] : [formatEur(Number(v)), 'GM/Staff']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="staff" name="Staff" fill="#1B3A6B" radius={[3, 3, 0, 0]} opacity={0.8}>
                    <LabelList dataKey="staff" position="top" style={{ fontSize: 9, fontWeight: 700, fill: '#1B3A6B' }} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="gmPerStaff" name="GM/Staff" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Key Insights ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 bg-[#1B3A6B] rounded flex items-center justify-center">
            <Info className="w-3 h-3 text-white" />
          </span>
          Key Insights & Takeaways
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {analysis.insights.map((ins, i) => (
            <Insight key={i} text={ins.text} type={ins.type} />
          ))}
          {analysis.insights.length === 0 && (
            <p className="text-sm text-gray-400 col-span-2 py-4 text-center">Insufficient data to generate insights.</p>
          )}
        </div>
      </div>

      {/* ── Comparaison pluriannuelle N / N-1 / N-2 ── */}
      <YearComparison scope={scope} annee={annee} mois={mois} />
    </div>
  );
}
