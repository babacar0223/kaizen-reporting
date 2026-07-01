import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { plService } from '../../services/pl.service';
import { useFiltersStore } from '../../stores/filters.store';
import { Save, CheckCircle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { MAIN_PL_LINES, OVERHEAD_LINES, computeFormulas, type PlLineConfig } from '../../lib/pl-lines';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_VALUES = ['ACTUALS', 'TARGET', 'YTD_N1'];
const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Fwd' },
  { value: 'LOGISTICS',          label: 'Logistics' },
];

type LignePl = { id: number; nom: string };
type ExistingRow = { mois: number; lignePl: { nom: string }; typeValeur: string; typePeriode: string; montant: number };

function fmt(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export default function SaisiePlPage() {
  const { bu, annee, mois } = useFiltersStore();
  const qc = useQueryClient();
  const [selectedBu, setSelectedBu]     = useState(bu);
  const [year]                           = useState(annee);
  const [typeValeur, setTypeValeur]      = useState('ACTUALS');
  const [entiteId, setEntiteId]          = useState<number | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([mois]);
  const [values, setValues]              = useState<Record<string, Record<number, string>>>({});
  const [loadedKeys, setLoadedKeys]      = useState<Set<string>>(new Set());
  const [saved, setSaved]                = useState(false);
  const [showOverhead, setShowOverhead]  = useState(false);
  const [downloading, setDownloading]    = useState(false);

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', selectedBu],
    queryFn: () => referentielService.getEntites(selectedBu),
  });
  const { data: lignes = [] } = useQuery<LignePl[]>({
    queryKey: ['lignes-pl'],
    queryFn: referentielService.getLignesPl,
  });

  // Fetch all months at once (mois=12 returns all)
  const { data: existingData } = useQuery({
    queryKey: ['pl-saisie', selectedBu, entiteId, year],
    queryFn: () => plService.getPlEntite(selectedBu, entiteId!, year, 12),
    enabled: !!entiteId,
  });

  // Which months already have data in DB (for indicators)
  const monthsWithData = useMemo(() => {
    const rows = (existingData as { data?: ExistingRow[] } | undefined)?.data || [];
    const set = new Set<number>();
    rows
      .filter(r => r.typeValeur === typeValeur && r.typePeriode === 'MTD' && r.montant !== 0)
      .forEach(r => set.add(r.mois));
    return set;
  }, [existingData, typeValeur]);

  // Pre-populate values + track which (nom, mois) pairs are loaded from DB
  useEffect(() => {
    const rows = (existingData as { data?: ExistingRow[] } | undefined)?.data || [];
    const newVals: Record<string, Record<number, string>> = {};
    const keys = new Set<string>();
    rows
      .filter(r => r.typeValeur === typeValeur && r.typePeriode === 'MTD' && r.montant !== 0)
      .forEach(r => {
        if (!newVals[r.lignePl.nom]) newVals[r.lignePl.nom] = {};
        newVals[r.lignePl.nom][r.mois] = String(r.montant);
        keys.add(`${r.lignePl.nom}|${r.mois}`);
      });
    setValues(newVals);
    setLoadedKeys(keys);
  }, [existingData, typeValeur]);

  const mutation = useMutation({
    mutationFn: (rows: object[]) => plService.batchUpsertPl(rows),
    onSuccess: () => {
      // Invalidate all dependent views
      qc.invalidateQueries({ queryKey: ['pl-bu'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      qc.invalidateQueries({ queryKey: ['pl-saisie'] });
      qc.invalidateQueries({ queryKey: ['pl-entite-mensuel'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function getVal(nom: string, m: number): number {
    return parseFloat(values[nom]?.[m] || '0') || 0;
  }
  function setVal(nom: string, m: number, val: string) {
    setValues(vv => ({ ...vv, [nom]: { ...(vv[nom] || {}), [m]: val } }));
  }

  function computeMonth(m: number) {
    return computeFormulas(nom => getVal(nom, m));
  }

  const handleSave = () => {
    if (!entiteId) return;
    const inputNoms = [
      ...MAIN_PL_LINES.filter(l => !l.computed).map(l => l.nom),
      ...OVERHEAD_LINES.map(l => l.nom),
    ];
    const rows: object[] = [];
    for (const m of selectedMonths) {
      for (const nom of inputNoms) {
        const ligneId = (lignes as LignePl[]).find(l => l.nom === nom)?.id;
        if (!ligneId) continue;
        const montant = getVal(nom, m);
        const key = `${nom}|${m}`;
        // Always include loaded rows (even if now 0) to properly overwrite/clear DB values
        if (montant === 0 && !loadedKeys.has(key)) continue;
        rows.push({ entiteId, bu: selectedBu, lignePlId: ligneId, annee: year, mois: m, typeValeur, typePeriode: 'MTD', montant });
      }
    }
    mutation.mutate(rows);
  };

  const handleDownload = async () => {
    if (!entiteId) return;
    setDownloading(true);
    try {
      const response = await plService.downloadEntityPl(selectedBu, entiteId, year);
      const blob = new Blob([response.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PL_${selectedBu}_${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setDownloading(false);
    }
  };

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev =>
      prev.includes(m)
        ? prev.length > 1 ? prev.filter(x => x !== m) : prev
        : [...prev, m].sort((a, b) => a - b)
    );
  };

  const inputCls = 'w-full text-right font-mono border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white';
  const colW = selectedMonths.length <= 3 ? 'min-w-[120px]' : selectedMonths.length <= 6 ? 'min-w-[100px]' : 'min-w-[88px]';

  function PlRow({ line }: { line: PlLineConfig }) {
    const isSubtotal = line.subtotal && !line.total;
    const isTotal    = line.total;
    const rowBg    = isTotal ? 'bg-indigo-50/60 font-bold' : isSubtotal ? 'bg-blue-50/30 font-semibold' : '';
    const stickyBg = isTotal ? 'bg-indigo-50/60' : isSubtotal ? 'bg-blue-50/30' : 'bg-white';
    const indent   = line.indent ? 'pl-7' : '';
    return (
      <tr className={`border-b border-gray-100 hover:bg-gray-50/30 ${rowBg}`}>
        <td className={`sticky left-0 px-3 py-1.5 text-xs text-gray-700 min-w-56 ${stickyBg} ${indent}`}>
          {line.nom}
          {line.hint && <span className="ml-1 text-gray-400 font-normal">(−)</span>}
        </td>
        {selectedMonths.map(m => {
          const calc = computeMonth(m);
          return (
            <td key={m} className={`px-2 py-1 ${colW}`}>
              {line.computed ? (
                <div className="text-right font-mono font-semibold text-gray-600 text-xs px-1.5 py-1">
                  {fmt(calc[line.nom] ?? 0)}
                </div>
              ) : (
                <input
                  type="number"
                  step="0.01"
                  value={values[line.nom]?.[m] || ''}
                  onChange={e => setVal(line.nom, m, e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Monthly P&amp;L Entry</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BU</label>
            <select value={selectedBu} onChange={e => { setSelectedBu(e.target.value); setEntiteId(null); }}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              {BU_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</label>
            <select value={entiteId ?? ''} onChange={e => setEntiteId(parseInt(e.target.value) || null)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              <option value="">Select…</option>
              {entites.map(e => <option key={e.id} value={e.id}>{e.nomCourt}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</label>
            <select value={typeValeur} onChange={e => setTypeValeur(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
              {TYPE_VALUES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year</label>
            <div className="mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 font-mono bg-gray-50">{year}</div>
          </div>
        </div>

        {/* Month selector with data coverage indicators */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Months to display</label>
            {entiteId && monthsWithData.size > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                = data in DB
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MONTHS_EN.map((m, i) => {
              const num = i + 1;
              const active   = selectedMonths.includes(num);
              const hasData  = monthsWithData.has(num);
              return (
                <button
                  key={num}
                  onClick={() => toggleMonth(num)}
                  className={`relative px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#1B3A6B] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {m}
                  {hasData && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border ${
                        active ? 'bg-[#00A3B4] border-[#1B3A6B]' : 'bg-green-500 border-white'
                      }`}
                    />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setSelectedMonths([1,2,3,4,5,6,7,8,9,10,11,12])}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200"
            >
              All
            </button>
          </div>
        </div>
      </div>

      {entiteId && (
        <>
          {/* Main P&L table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">P&amp;L Summary</span>
              <span className="text-xs text-gray-400">{year} · {typeValeur}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50/60 border-b text-xs text-gray-500">
                    <th className="sticky left-0 bg-gray-50/60 text-left px-3 py-2 font-semibold min-w-56">P&amp;L Line</th>
                    {selectedMonths.map(m => (
                      <th key={m} className={`px-2 py-2 text-right font-semibold ${colW}`}>{MONTHS_EN[m - 1]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MAIN_PL_LINES.map(line => <PlRow key={line.nom} line={line} />)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overhead Detail — collapsible */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowOverhead(s => !s)}
              className="w-full bg-gray-50 border-b px-4 py-2 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                Overhead Detail <span className="font-normal text-gray-400">({OVERHEAD_LINES.length} lines)</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">
                  {selectedMonths.map(m => fmt(computeMonth(m)._OVERHEADS_TOTAL)).join(' / ')}
                </span>
                {showOverhead
                  ? <ChevronDown className="w-4 h-4 text-gray-400" />
                  : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </div>
            </button>
            {showOverhead && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/60 border-b text-xs text-gray-500">
                      <th className="sticky left-0 bg-gray-50/60 text-left px-3 py-2 font-semibold min-w-56">Overhead Line</th>
                      {selectedMonths.map(m => (
                        <th key={m} className={`px-2 py-2 text-right font-semibold ${colW}`}>{MONTHS_EN[m - 1]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {OVERHEAD_LINES.map(line => (
                      <tr key={line.nom} className="border-b border-gray-100 hover:bg-gray-50/30">
                        <td className="sticky left-0 bg-white px-3 py-1.5 text-xs text-gray-700 min-w-56">{line.nom}</td>
                        {selectedMonths.map(m => (
                          <td key={m} className={`px-2 py-1 ${colW}`}>
                            <input
                              type="number"
                              step="0.01"
                              value={values[line.nom]?.[m] || ''}
                              onChange={e => setVal(line.nom, m, e.target.value)}
                              placeholder="0"
                              className={inputCls}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-blue-50/50 border-t-2 border-blue-200 font-semibold">
                      <td className="px-3 py-2 text-xs text-blue-900">OVERHEADS TOTAL</td>
                      {selectedMonths.map(m => (
                        <td key={m} className="px-2 py-2 text-right font-mono text-blue-900 text-xs">
                          {fmt(computeMonth(m)._OVERHEADS_TOTAL)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Save / Export bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="flex items-center gap-2 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1B3A6B]/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Saving…' : `Save (${selectedMonths.map(m => MONTHS_EN[m - 1]).join(', ')})`}
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Data saved successfully
              </div>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="ml-auto flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Exporting…' : 'Export Excel'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
