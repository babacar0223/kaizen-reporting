import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { salesService } from '../../services/sales.service';
import { useAuthStore } from '../../stores/auth.store';
import { formatEur, formatPct } from '../../lib/utils';
import { X, ArrowUpDown, TrendingUp, Wallet, PieChart, Percent } from 'lucide-react';
import type { ClientOverviewRow } from '../../types';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Fwd' },
  { value: 'LOGISTICS',          label: 'Logistics' },
];
// Palette for client groups (Barrick, Tongon…) — "Others" is grey.
const GROUP_COLORS = ['#1B5E8B', '#8B1E5E', '#0E6B5E', '#B45309', '#4A1E8B', '#0F766E'];
const groupColor = (name: string, i: number) => (name.toUpperCase() === 'OTHERS' ? '#94a3b8' : GROUP_COLORS[i % GROUP_COLORS.length]);

type SortKey = 'revActual' | 'gmActual' | 'achievement';

function achievementBadge(pct: number | null) {
  if (pct === null) return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-400">—</span>;
  const cls = pct >= 1 ? 'bg-emerald-100 text-emerald-700' : pct >= 0.9 ? 'bg-green-100 text-green-700'
    : pct >= 0.7 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{formatPct(pct)}</span>;
}

// Margin-rate colour (logistics/procurement margins ~5% typical)
function marginRateClass(rate: number | null): string {
  if (rate === null) return 'text-gray-300';
  if (rate < 0) return 'text-red-600 font-bold';
  if (rate >= 0.09) return 'text-emerald-600 font-semibold';
  if (rate >= 0.045) return 'text-amber-600';
  return 'text-red-500';
}

// Blue tint proportional to the value (0 -> transparent, max -> solid blue)
function heatStyle(value: number, max: number): React.CSSProperties {
  if (max <= 0 || value <= 0) return {};
  const t = Math.min(value / max, 1);
  return { backgroundColor: `rgba(27, 94, 139, ${(0.06 + t * 0.32).toFixed(3)})` };
}

function ClientDetailPanel({ client, onClose }: { client: ClientOverviewRow; onClose: () => void }) {
  const chartData = client.monthly.map(m => ({ mois: MONTHS_EN[m.mois - 1], Revenue: m.revActual, Margin: m.gmActual }));
  const tiles = [
    { label: 'Revenue YTD',   value: formatEur(client.revActual, true),                              accent: 'bg-blue-50 text-blue-700',    icon: TrendingUp },
    { label: 'Annual budget',value: formatEur(client.revTargetAnnual || client.revTarget, true),    accent: 'bg-violet-50 text-violet-700',icon: Wallet },
    { label: 'Margin YTD',   value: formatEur(client.gmActual, true),                               accent: client.gmActual >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700', icon: PieChart },
    { label: 'Margin rate',  value: client.marginRate !== null ? formatPct(client.marginRate) : '—',accent: 'bg-teal-50 text-teal-700',    icon: Percent },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#1B3A6B] to-[#1B5E8B] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">{client.clientNom}</h2>
            <p className="text-blue-200 text-xs mt-0.5">{client.entite} · group {client.groupe || 'Others'}</p>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-4 gap-3">
            {tiles.map(t => (
              <div key={t.label} className={`rounded-xl p-3 text-center ${t.accent}`}>
                <t.icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
                <p className="text-[10px] uppercase font-bold opacity-70 mb-0.5">{t.label}</p>
                <p className="text-sm font-black">{t.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Monthly trend</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatEur(Number(v), true)} width={64} />
                <Tooltip formatter={(value) => formatEur(Number(value))} />
                <Line type="monotone" dataKey="Revenue" stroke="#1B5E8B" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Margin" stroke="#0E9F6E" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientsOverviewPage() {
  const user = useAuthStore(s => s.user);
  const isViewer = user?.role === 'VIEWER';
  // Un VIEWER ne voit que sa/ses BU ; la sélection de BU est verrouillée sur son périmètre.
  const buChoices = useMemo(
    () => (isViewer && user?.buAccess?.length ? BU_OPTIONS.filter(o => user.buAccess.includes(o.value)) : BU_OPTIONS),
    [isViewer, user?.buAccess],
  );
  const [bu, setBu] = useState(() => {
    const u = useAuthStore.getState().user;
    if (u?.role === 'VIEWER' && u.buAccess?.length) {
      const first = BU_OPTIONS.find(o => u.buAccess.includes(o.value));
      if (first) return first.value;
    }
    return 'LOGISTICS';
  });
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [moisMin, setMoisMin] = useState(1);
  const [mois, setMois] = useState(new Date().getMonth() + 1);
  const [search, setSearch] = useState('');
  const [groupeFilter, setGroupeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('revActual');
  const [selected, setSelected] = useState<ClientOverviewRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['clients-overview', bu, annee, mois],
    queryFn: () => salesService.getClientsOverview(bu, annee, mois),
  });

  const clients = data?.clients ?? [];
  const monthRange = useMemo(() => {
    const arr: number[] = [];
    for (let m = moisMin; m <= mois; m++) arr.push(m);
    return arr;
  }, [moisMin, mois]);

  function rangeRev(c: ClientOverviewRow): number {
    return monthRange.reduce((s, m) => s + (c.monthly.find(x => x.mois === m)?.revActual ?? 0), 0);
  }
  function rangeGm(c: ClientOverviewRow): number {
    return monthRange.reduce((s, m) => s + (c.monthly.find(x => x.mois === m)?.gmActual ?? 0), 0);
  }
  function rangeBudget(c: ClientOverviewRow): number {
    const annual = c.revTargetAnnual || 0;
    if (annual !== 0) return (annual / 12) * monthRange.length;
    return c.revTarget;
  }
  function achievementOf(c: ClientOverviewRow): number | null {
    const b = rangeBudget(c);
    return b !== 0 ? rangeRev(c) / b : null;
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = term
      ? clients.filter(c => c.clientNom.toLowerCase().includes(term) || c.entite.toLowerCase().includes(term))
      : clients;
    if (groupeFilter) list = list.filter(c => (c.groupe || 'Others') === groupeFilter);
    return [...list].sort((a, b) => {
      const av = sortKey === 'achievement' ? (achievementOf(a) ?? -1) : sortKey === 'revActual' ? rangeRev(a) : rangeGm(a);
      const bv = sortKey === 'achievement' ? (achievementOf(b) ?? -1) : sortKey === 'revActual' ? rangeRev(b) : rangeGm(b);
      return bv - av;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, search, groupeFilter, sortKey, monthRange]);

  const maxRowRev = useMemo(() => filtered.reduce((mx, c) => Math.max(mx, rangeRev(c)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, monthRange]);
  const maxCellRev = useMemo(() => filtered.reduce((mx, c) =>
    Math.max(mx, ...monthRange.map(m => c.monthly.find(x => x.mois === m)?.revActual ?? 0)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, monthRange]);

  const totals = useMemo(() => filtered.reduce(
    (acc, c) => ({ revActual: acc.revActual + rangeRev(c), revTarget: acc.revTarget + rangeBudget(c), gmActual: acc.gmActual + rangeGm(c) }),
    { revActual: 0, revTarget: 0, gmActual: 0 }
  ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, monthRange]);
  const totalAchiev = totals.revTarget !== 0 ? totals.revActual / totals.revTarget : null;
  const totalMargin = totals.revActual !== 0 ? totals.gmActual / totals.revActual : null;

  const groupBreakdown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const src = term
      ? clients.filter(c => c.clientNom.toLowerCase().includes(term) || c.entite.toLowerCase().includes(term))
      : clients;
    const map = new Map<string, { groupe: string; rev: number; gm: number }>();
    for (const c of src) {
      const g = c.groupe || 'Others';
      const agg = map.get(g) ?? { groupe: g, rev: 0, gm: 0 };
      agg.rev += rangeRev(c);
      agg.gm += rangeGm(c);
      map.set(g, agg);
    }
    const totalRev = [...map.values()].reduce((s, g) => s + g.rev, 0);
    return {
      totalRev,
      rows: [...map.values()]
        .map(g => ({ ...g, share: totalRev !== 0 ? g.rev / totalRev : 0, marginRate: g.rev !== 0 ? g.gm / g.rev : null }))
        .sort((a, b) => {
          if (a.groupe === 'Others') return 1;
          if (b.groupe === 'Others') return -1;
          return b.rev - a.rev;
        }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, search, monthRange]);

  const SortButton = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => setSortKey(k)} className={`inline-flex items-center gap-1 ${sortKey === k ? 'text-[#1B3A6B] font-bold' : 'text-gray-500'}`}>
      {label} <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  const kpiCards = [
    { label: 'Revenue YTD (filtered)', value: formatEur(totals.revActual, true), grad: 'from-[#1B3A6B] to-[#1B5E8B]', icon: TrendingUp,
      sub: `${filtered.length} client(s)` },
    { label: 'Budget YTD', value: formatEur(totals.revTarget, true), grad: 'from-[#5B21B6] to-[#7C3AED]', icon: Wallet,
      sub: totalAchiev !== null ? `achievement ${formatPct(totalAchiev)}` : 'no budget' },
    { label: 'Margin YTD', value: formatEur(totals.gmActual, true), grad: totals.gmActual >= 0 ? 'from-[#0E6B5E] to-[#15857A]' : 'from-[#B91C1C] to-[#DC2626]', icon: PieChart,
      sub: totalMargin !== null ? `rate ${formatPct(totalMargin)}` : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Clients</h1>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {!(isViewer && buChoices.length <= 1) && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BU</label>
              <select value={bu} onChange={e => setBu(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
                {buChoices.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year</label>
            <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value) || annee)} min={2020} max={2035}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From month</label>
            <select value={moisMin} onChange={e => { const v = parseInt(e.target.value); setMoisMin(v); if (v > mois) setMois(v); }}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              {MONTHS_EN.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To month</label>
            <select value={mois} onChange={e => { const v = parseInt(e.target.value); setMois(v); if (v < moisMin) setMoisMin(v); }}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              {MONTHS_EN.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Client or entity…"
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" />
          </div>
        </div>
      </div>

      {/* ── Coloured KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpiCards.map(k => (
          <div key={k.label} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${k.grad} text-white p-4 shadow-md`}>
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-2 text-white/70 text-[11px] font-bold uppercase tracking-wide">
                <k.icon className="w-3.5 h-3.5" /> {k.label}
              </div>
              <p className="text-2xl font-black mt-1">{k.value}</p>
              <p className="text-white/70 text-xs mt-0.5">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Client group breakdown ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Client group breakdown</span>
          {groupeFilter && (
            <button onClick={() => setGroupeFilter(null)} className="text-xs text-[#1B3A6B] font-semibold hover:underline">
              Clear filter ({groupeFilter})
            </button>
          )}
        </div>

        {/* stacked share bar */}
        {groupBreakdown.totalRev > 0 && (
          <div className="px-4 pt-3">
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
              {groupBreakdown.rows.map((g, i) => (
                <div key={g.groupe} title={`${g.groupe} · ${formatPct(g.share)}`}
                  style={{ width: `${g.share * 100}%`, backgroundColor: groupColor(g.groupe, i) }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {groupBreakdown.rows.map((g, i) => (
                <span key={g.groupe} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: groupColor(g.groupe, i) }} />
                  {g.groupe} <span className="font-semibold">{formatPct(g.share)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto p-2">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left px-3 py-2 font-semibold">Group</th>
                <th className="text-right px-3 py-2 font-semibold">Sales YTD</th>
                <th className="text-right px-3 py-2 font-semibold">% of Revenue</th>
                <th className="text-right px-3 py-2 font-semibold">Margin YTD</th>
                <th className="text-right px-3 py-2 font-semibold">Margin rate</th>
              </tr>
            </thead>
            <tbody>
              {groupBreakdown.rows.map((g, i) => (
                <tr
                  key={g.groupe}
                  onClick={() => setGroupeFilter(prev => prev === g.groupe ? null : g.groupe)}
                  className={`cursor-pointer transition-colors ${groupeFilter === g.groupe ? 'bg-blue-50' : 'hover:bg-gray-50/70'}`}
                >
                  <td className="px-3 py-2.5 font-bold text-gray-800 border-l-4 rounded-l" style={{ borderColor: groupColor(g.groupe, i) }}>{g.groupe}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900">{formatEur(g.rev, true)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatPct(g.share)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${g.gm >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatEur(g.gm, true)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${marginRateClass(g.marginRate)}`}>{g.marginRate !== null ? formatPct(g.marginRate) : '—'}</td>
                </tr>
              ))}
              {groupBreakdown.rows.length > 1 && (
                <tr className="border-t-2 border-gray-200 font-bold bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-800">Total</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-900">{formatEur(groupBreakdown.totalRev, true)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-500">100.0%</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-900">{formatEur(groupBreakdown.rows.reduce((s, g) => s + g.gm, 0), true)}</td>
                  <td className="px-3 py-2.5"></td>
                </tr>
              )}
              {!isLoading && groupBreakdown.rows.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 py-8">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100">
          Groups are configured in <strong>Import &amp; Data Entry → Client Groups</strong> and persist across re-imports. Click a row to filter the portfolio.
        </p>
      </div>

      {/* ── Client portfolio ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Client portfolio</span>
          <span className="text-xs text-gray-400">{isLoading ? 'Loading…' : `${filtered.length} client(s)`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50/60 border-b text-gray-500">
                <th className="sticky left-0 bg-gray-50/60 text-left px-4 py-2.5 font-semibold">Client</th>
                <th className="text-left px-3 py-2.5 font-semibold">Group</th>
                {monthRange.map(m => (
                  <th key={m} className="text-right px-2.5 py-2.5 font-semibold whitespace-nowrap">{MONTHS_EN[m - 1]}</th>
                ))}
                <th className="text-right px-3 py-2.5 font-semibold border-l border-gray-200"><SortButton k="revActual" label="Sales" /></th>
                <th className="text-right px-3 py-2.5 font-semibold">Budget</th>
                <th className="text-center px-3 py-2.5 font-semibold">Achievement</th>
                <th className="text-right px-3 py-2.5 font-semibold"><SortButton k="gmActual" label="Margin" /></th>
                <th className="text-right px-3 py-2.5 font-semibold">Margin rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const rr = rangeRev(c);
                const gm = rangeGm(c);
                return (
                  <tr key={`${c.entiteId}-${c.clientNom}-${i}`} onClick={() => setSelected(c)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="sticky left-0 bg-white px-4 py-2.5 font-semibold text-gray-800">
                      {c.clientNom}
                      <span className="block text-[10px] font-normal text-gray-400">{c.entite}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: groupColor(c.groupe || 'Others', groupBreakdown.rows.findIndex(g => g.groupe === (c.groupe || 'Others'))) }}>
                        {c.groupe || 'Others'}
                      </span>
                    </td>
                    {monthRange.map(m => {
                      const v = c.monthly.find(x => x.mois === m)?.revActual ?? 0;
                      return (
                        <td key={m} className="px-2.5 py-2.5 text-right font-mono text-gray-600 whitespace-nowrap" style={heatStyle(v, maxCellRev)}>
                          {v ? formatEur(v, true) : '·'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 border-l border-gray-100" style={heatStyle(rr, maxRowRev)}>{formatEur(rr, true)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-400">{formatEur(rangeBudget(c), true)}</td>
                    <td className="px-3 py-2.5 text-center">{achievementBadge(achievementOf(c))}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold ${gm >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatEur(gm, true)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${marginRateClass(c.marginRate)}`}>{c.marginRate !== null ? formatPct(c.marginRate) : '—'}</td>
                  </tr>
                );
              })}
              {filtered.length > 0 && (
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                  <td className="sticky left-0 bg-gray-50 px-4 py-2.5 text-gray-800">Total ({filtered.length})</td>
                  <td />
                  {monthRange.map(m => {
                    const colSum = filtered.reduce((s, c) => s + (c.monthly.find(x => x.mois === m)?.revActual ?? 0), 0);
                    return <td key={m} className="px-2.5 py-2.5 text-right font-mono text-gray-700 whitespace-nowrap">{colSum ? formatEur(colSum, true) : '·'}</td>;
                  })}
                  <td className="px-3 py-2.5 text-right font-mono text-gray-900 border-l border-gray-200">{formatEur(totals.revActual, true)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gray-500">{formatEur(totals.revTarget, true)}</td>
                  <td className="px-3 py-2.5 text-center">{achievementBadge(totalAchiev)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${totals.gmActual >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatEur(totals.gmActual, true)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${marginRateClass(totalMargin)}`}>{totalMargin !== null ? formatPct(totalMargin) : '—'}</td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7 + monthRange.length} className="text-center text-gray-400 py-10">No client found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <ClientDetailPanel client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
