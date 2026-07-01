import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Target, BarChart3, Activity,
         DollarSign, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { useFiltersStore } from '../stores/filters.store';
import { plService } from '../services/pl.service';
import { formatEur, formatPct } from '../lib/utils';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BU_THEME: Record<string, { label: string; grad: string; light: string; dot: string; ring: string }> = {
  PROCUREMENT:        { label: 'Procurement',        grad: 'from-[#1B3A6B] to-[#1B5E8B]', light: 'bg-blue-50',    dot: '#1B5E8B', ring: 'ring-blue-200' },
  FREIGHT_FORWARDING: { label: 'Freight Forwarding', grad: 'from-[#3B1B8B] to-[#6B35B5]', light: 'bg-purple-50', dot: '#6B35B5', ring: 'ring-purple-200' },
  LOGISTICS:          { label: 'Logistics',           grad: 'from-[#0E6B5E] to-[#15857A]', light: 'bg-emerald-50',dot: '#15857A', ring: 'ring-emerald-200' },
};

const BUS = ['PROCUREMENT', 'FREIGHT_FORWARDING', 'LOGISTICS'] as const;

const KPI_CONFIG = [
  { line: 'Revenue',      icon: DollarSign, iconBg: 'bg-blue-100',    iconColor: 'text-blue-600' },
  { line: 'Gross Margin', icon: BarChart3,  iconBg: 'bg-teal-100',    iconColor: 'text-teal-600' },
  { line: 'EBITDA',       icon: Activity,   iconBg: 'bg-amber-100',   iconColor: 'text-amber-600' },
  { line: 'Net Earnings', icon: Target,     iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
];

function TrendPill({ pct }: { pct: number }) {
  if (pct > 0.02) return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
      <TrendingUp className="w-3 h-3" />{pct >= 0 ? '+' : ''}{formatPct(pct)}
    </span>
  );
  if (pct < -0.02) return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 rounded-full px-2 py-0.5">
      <TrendingDown className="w-3 h-3" />{formatPct(pct)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
      <Minus className="w-3 h-3" />{formatPct(pct)}
    </span>
  );
}

// ── Executive View ────────────────────────────────────────────────────────────

function BuExecCard({ bu, annee, mois, nMonths }: { bu: string; annee: number; mois: number; nMonths: number }) {
  const theme = BU_THEME[bu];
  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi', bu, annee, mois],
    queryFn: () => plService.getKpiBu(bu, annee, mois),
  });

  const kpis = data?.kpis || {};
  const rev   = kpis['Revenue'];
  const gm    = kpis['Gross Margin'];
  const ebit  = kpis['EBITDA'];
  const net   = kpis['Net Earnings'];

  const revActuals = rev?.ACTUALS || 0;
  const revTarget  = ((rev?.TARGET  || 0) / 12) * nMonths;
  const revN1      = rev?.YTD_N1  || 0;
  const revPct     = revTarget !== 0 ? revActuals / revTarget : 0;
  const revVsN1    = revN1 !== 0 ? (revActuals - revN1) / Math.abs(revN1) : 0;

  const gmActuals = gm?.ACTUALS || 0;
  const gmRate    = revActuals !== 0 ? gmActuals / revActuals : 0;

  const ebitActuals = ebit?.ACTUALS || 0;
  const ebitTarget  = ((ebit?.TARGET  || 0) / 12) * nMonths;
  const ebitPct     = revActuals !== 0 ? ebitActuals / revActuals : 0;
  const ebitBudPct  = ebitTarget !== 0 ? ebitActuals / ebitTarget : 0;

  const netActuals = net?.ACTUALS || 0;
  const netRate    = revActuals !== 0 ? netActuals / revActuals : 0;

  if (isLoading) return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ring-1 ${theme.ring} flex flex-col`}>
      <div className={`bg-gradient-to-r ${theme.grad} px-4 py-3`}>
        <p className="text-white font-bold text-sm">{theme.label}</p>
      </div>
      <div className="flex-1 flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (error) return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ring-1 ${theme.ring}`}>
      <div className={`bg-gradient-to-r ${theme.grad} px-4 py-3`}>
        <p className="text-white font-bold text-sm">{theme.label}</p>
      </div>
      <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
        <AlertCircle className="w-4 h-4" /> No data
      </div>
    </div>
  );

  const pctColor = revPct >= 1 ? '#22c55e' : revPct >= 0.85 ? '#f59e0b' : '#ef4444';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ring-1 ${theme.ring} flex flex-col`}>
      {/* BU header */}
      <div className={`bg-gradient-to-r ${theme.grad} px-4 py-3 flex items-center justify-between`}>
        <p className="text-white font-bold text-sm">{theme.label}</p>
        <span className="text-white/70 text-xs font-medium">YTD {MONTHS_EN[mois - 1]} {annee}</span>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Revenue */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
          <p className="text-2xl font-black text-gray-900">{formatEur(revActuals, true)}</p>
          <div className="mt-1.5">
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>vs Budget</span>
              <span className="font-semibold" style={{ color: pctColor }}>{Math.round(revPct * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(revPct * 100, 100)}%`, backgroundColor: pctColor }} />
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">vs N-1</span>
            <TrendPill pct={revVsN1} />
          </div>
        </div>

        <div className="border-t border-gray-50" />

        {/* Margin + EBITDA + Net */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Gross Margin', value: gmActuals, rate: gmRate },
            { label: 'EBITDA',       value: ebitActuals, rate: ebitPct, budPct: ebitBudPct },
            { label: 'Net Earnings', value: netActuals, rate: netRate },
          ].map(item => {
            const pos = item.value >= 0;
            return (
              <div key={item.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-tight mb-1">{item.label}</p>
                <p className={`text-sm font-black ${pos ? 'text-gray-900' : 'text-red-600'}`}>{formatEur(item.value, true)}</p>
                <p className={`text-[10px] font-semibold mt-0.5 ${pos ? 'text-teal-600' : 'text-red-500'}`}>{formatPct(item.rate)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConsolidatedRow({ annee, mois, nMonths }: { annee: number; mois: number; nMonths: number }) {
  const results = useQueries({
    queries: BUS.map(bu => ({
      queryKey: ['kpi', bu, annee, mois],
      queryFn: () => plService.getKpiBu(bu, annee, mois),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const allLoaded = results.every(r => !r.isLoading);
  if (!allLoaded) return null;

  const sum = (line: string, type: string) =>
    results.reduce((acc, r) => acc + (r.data?.kpis?.[line]?.[type] || 0), 0);

  const totalRev    = sum('Revenue', 'ACTUALS');
  const totalRevT   = (sum('Revenue', 'TARGET') / 12) * nMonths;
  const totalRevN1  = sum('Revenue', 'YTD_N1');
  const totalGM     = sum('Gross Margin', 'ACTUALS');
  const totalEbit   = sum('EBITDA', 'ACTUALS');
  const totalEbitT  = (sum('EBITDA', 'TARGET') / 12) * nMonths;
  const totalNet    = sum('Net Earnings', 'ACTUALS');

  const revPct  = totalRevT  !== 0 ? totalRev  / totalRevT  : 0;
  const vsN1    = totalRevN1 !== 0 ? (totalRev - totalRevN1) / Math.abs(totalRevN1) : 0;
  const ebitPct = totalEbitT !== 0 ? totalEbit / totalEbitT : 0;
  const gmRate  = totalRev   !== 0 ? totalGM   / totalRev   : 0;
  const ebitRate = totalRev  !== 0 ? totalEbit / totalRev   : 0;
  const netRate  = totalRev  !== 0 ? totalNet  / totalRev   : 0;

  const revColor  = revPct  >= 1 ? 'text-green-700 bg-green-50' : revPct  >= 0.85 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  const ebitColor = ebitPct >= 1 ? 'text-green-700 bg-green-50' : ebitPct >= 0.85 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';

  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-white/60" />
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Groupe CSTT AO — Consolidé</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Revenue total', value: totalRev, extra: `${Math.round(revPct * 100)}% budget`, extraCls: revColor, sub: vsN1 },
          { label: 'Gross Margin', value: totalGM,  extra: formatPct(gmRate) + ' marge', extraCls: 'text-teal-300 bg-teal-900/40' },
          { label: 'EBITDA',      value: totalEbit, extra: `${Math.round(ebitPct * 100)}% budget`, extraCls: ebitColor, rate: ebitRate },
          { label: 'Net Earnings', value: totalNet, extra: formatPct(netRate) + ' marge nette', extraCls: totalNet >= 0 ? 'text-green-300 bg-green-900/40' : 'text-red-300 bg-red-900/40' },
        ].map(item => (
          <div key={item.label} className="bg-white/5 rounded-xl p-3">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-wide mb-1">{item.label}</p>
            <p className={`text-xl font-black ${item.value >= 0 ? 'text-white' : 'text-red-400'}`}>{formatEur(item.value, true)}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.extraCls}`}>{item.extra}</span>
              {'sub' in item && item.sub !== undefined && <TrendPill pct={item.sub} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutiveView({ annee, mois, nMonths }: { annee: number; mois: number; nMonths: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BUS.map(bu => <BuExecCard key={bu} bu={bu} annee={annee} mois={mois} nMonths={nMonths} />)}
      </div>
      <ConsolidatedRow annee={annee} mois={mois} nMonths={nMonths} />
    </div>
  );
}

// ── Standard Dashboard ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { bu, annee, mois, moisMin } = useFiltersStore();
  const nMonths = mois - moisMin + 1;
  const theme = BU_THEME[bu] || BU_THEME.PROCUREMENT;
  const [execMode, setExecMode] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['kpi', bu, annee, mois],
    queryFn: () => plService.getKpiBu(bu, annee, mois),
    enabled: !execMode,
  });

  const kpis = data?.kpis || {};
  const hasData = Object.keys(kpis).length > 0;
  const rev = kpis['Revenue'];
  const annualRevTarget = rev?.TARGET || 0;
  const proratRevTarget = (annualRevTarget / 12) * nMonths;
  const globalPct = proratRevTarget > 0 ? (rev?.ACTUALS || 0) / proratRevTarget : null;

  return (
    <div className="space-y-6">

      {/* ── Hero Banner ── */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${theme.grad} text-white p-6 shadow-lg`}>
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-6 -right-2 w-24 h-24 rounded-full bg-white/8" />
        <div className="absolute top-4 right-32 w-12 h-12 rounded-full bg-white/10" />

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Financial Dashboard</p>
            <h1 className="text-2xl font-bold">{execMode ? 'Vue Executive · 3 BU' : theme.label}</h1>
            <p className="text-white/70 text-sm mt-1">YTD {MONTHS_EN[mois - 1]} {annee}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Vue Executive toggle */}
            <button
              onClick={() => setExecMode(v => !v)}
              className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all border ${
                execMode
                  ? 'bg-white text-gray-900 border-white shadow-lg'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/30'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Vue executive
              {execMode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {!execMode && globalPct !== null && (
              <div className="text-right">
                <p className="text-white/60 text-xs font-medium uppercase tracking-wide mb-1">Budget Achievement</p>
                <p className="text-4xl font-black">{Math.round(globalPct * 100)}<span className="text-2xl text-white/70">%</span></p>
                <div className="mt-2 w-32 h-1.5 bg-white/20 rounded-full ml-auto">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${Math.min(globalPct * 100, 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Executive View ── */}
      {execMode && <ExecutiveView annee={annee} mois={mois} nMonths={nMonths} />}

      {/* ── Standard BU View ── */}
      {!execMode && (
        <>
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 border-3 border-[#1B3A6B] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-400">Loading dashboard…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm font-semibold text-red-700">Failed to load data</p>
              <p className="text-xs text-gray-400">Check the server connection and try again</p>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {KPI_CONFIG.map(({ line, icon: Icon, iconBg, iconColor }) => {
                  const actuals  = kpis[line]?.ACTUALS || 0;
                  const target   = ((kpis[line]?.TARGET || 0) / 12) * nMonths;
                  const ytdN1    = kpis[line]?.YTD_N1  || 0;
                  const vsTarget = target !== 0 ? (actuals - target) / Math.abs(target) : 0;
                  const vsN1     = ytdN1  !== 0 ? (actuals - ytdN1)  / Math.abs(ytdN1)  : 0;
                  const pct      = target !== 0 ? Math.min(actuals / target, 1.5) : 0;
                  const pctColor = pct >= 1 ? '#22c55e' : pct >= 0.85 ? '#f59e0b' : '#ef4444';

                  return (
                    <div key={line} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      <div className={`h-1 bg-gradient-to-r ${theme.grad}`} />
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                            <Icon className={`w-4.5 h-4.5 ${iconColor}`} />
                          </div>
                          <TrendPill pct={vsTarget} />
                        </div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{line}</p>
                        <p className="text-[1.6rem] font-black text-gray-900 leading-tight">{formatEur(actuals, true)}</p>

                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1 text-gray-400">
                            <span>Budget progress</span>
                            <span className="font-semibold" style={{ color: pctColor }}>{Math.round(pct * 100)}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pct * 100, 100)}%`, backgroundColor: pctColor }} />
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-xs">
                          <span className="text-gray-400">vs Prior Year</span>
                          <TrendPill pct={vsN1} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary strip */}
              {hasData && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Revenue vs Budget',      val: kpis['Revenue']      ? (kpis['Revenue'].ACTUALS || 0)      - ((kpis['Revenue'].TARGET      || 0) / 12 * nMonths) : null },
                    { label: 'EBITDA vs Budget',       val: kpis['EBITDA']       ? (kpis['EBITDA'].ACTUALS  || 0)      - ((kpis['EBITDA'].TARGET       || 0) / 12 * nMonths) : null },
                    { label: 'Net Earnings vs Budget', val: kpis['Net Earnings'] ? (kpis['Net Earnings'].ACTUALS || 0) - ((kpis['Net Earnings'].TARGET  || 0) / 12 * nMonths) : null },
                  ].map(({ label, val }) => {
                    if (val === null) return null;
                    const positive = val >= 0;
                    return (
                      <div key={label} className={`rounded-xl border p-4 ${positive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                        <p className={`text-xl font-black ${positive ? 'text-green-700' : 'text-red-600'}`}>
                          {positive ? '+' : ''}{formatEur(val, true)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No data */}
              {!hasData && (
                <div className={`rounded-2xl border-2 border-dashed p-10 text-center ${theme.light}`}>
                  <div className={`w-14 h-14 bg-gradient-to-br ${theme.grad} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow`}>
                    <BarChart3 className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-base font-bold text-gray-700">No data for {MONTHS_EN[mois - 1]} {annee}</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Import an Excel file or use <strong>Import → Direct P&L Entry</strong> to enter figures manually.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
