import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { salesService } from '../../services/sales.service';
import { useFiltersStore } from '../../stores/filters.store';
import { Save, CheckCircle, Plus, Trash2 } from 'lucide-react';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Fwd' },
  { value: 'LOGISTICS',          label: 'Logistics' },
];

type ClientRow = {
  clientNom: string;
  revActual: string;
  revTarget: string;
  gmActual: string;
  gmTarget: string;
};

function emptyClientRow(): ClientRow {
  return { clientNom: '', revActual: '', revTarget: '', gmActual: '', gmTarget: '' };
}

function fmt(n: number): string {
  if (n === 0) return '';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export default function SaisieSalesPage() {
  const { bu, annee, mois } = useFiltersStore();
  const qc = useQueryClient();
  const [selectedBu, setSelectedBu] = useState(bu);
  const [year, setYear] = useState(annee);
  const [month, setMonth] = useState(mois);
  const [entiteId, setEntiteId] = useState<number | null>(null);
  const [rows, setRows] = useState<ClientRow[]>([emptyClientRow()]);
  const [saved, setSaved] = useState(false);

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', selectedBu],
    queryFn: () => referentielService.getEntites(selectedBu),
  });

  const { data: salesData } = useQuery({
    queryKey: ['sales', selectedBu, entiteId, year, month],
    queryFn: () => salesService.getSales(selectedBu, entiteId!, year, month),
    enabled: !!entiteId,
  });

  // Pre-populate grid from DB data
  useEffect(() => {
    const data = salesData?.data ?? [];
    if (data.length === 0) {
      setRows([emptyClientRow()]);
      return;
    }
    const clientMap = new Map<string, ClientRow>();
    for (const r of data) {
      if (!clientMap.has(r.clientNom)) {
        clientMap.set(r.clientNom, emptyClientRow());
        clientMap.get(r.clientNom)!.clientNom = r.clientNom;
      }
      const row = clientMap.get(r.clientNom)!;
      if (r.lignePl === 'Revenue'       && r.typeValeur === 'ACTUALS') row.revActual = String(r.montant);
      if (r.lignePl === 'Revenue'       && r.typeValeur === 'TARGET')  row.revTarget = String(r.montant);
      if (r.lignePl === 'Gross Margin'  && r.typeValeur === 'ACTUALS') row.gmActual  = String(r.montant);
      if (r.lignePl === 'Gross Margin'  && r.typeValeur === 'TARGET')  row.gmTarget  = String(r.montant);
    }
    const loaded = Array.from(clientMap.values());
    setRows(loaded.length > 0 ? loaded : [emptyClientRow()]);
  }, [salesData]);

  // Reset rows when period/entity changes
  useEffect(() => {
    if (!salesData) setRows([emptyClientRow()]);
  }, [entiteId, year, month, selectedBu]);

  const mutation = useMutation({
    mutationFn: (apiRows: object[]) => salesService.upsertSales(apiRows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['pl-bu'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function handleSave() {
    if (!entiteId) return;
    const apiRows: object[] = [];
    for (const r of rows) {
      if (!r.clientNom.trim()) continue;
      const base = { entiteId, bu: selectedBu, annee: year, mois: month, clientNom: r.clientNom.trim() };
      if (parseFloat(r.revActual) || 0)
        apiRows.push({ ...base, lignePl: 'Revenue',      typeValeur: 'ACTUALS', montant: parseFloat(r.revActual) });
      if (parseFloat(r.revTarget) || 0)
        apiRows.push({ ...base, lignePl: 'Revenue',      typeValeur: 'TARGET',  montant: parseFloat(r.revTarget) });
      if (parseFloat(r.gmActual) || 0)
        apiRows.push({ ...base, lignePl: 'Gross Margin', typeValeur: 'ACTUALS', montant: parseFloat(r.gmActual) });
      if (parseFloat(r.gmTarget) || 0)
        apiRows.push({ ...base, lignePl: 'Gross Margin', typeValeur: 'TARGET',  montant: parseFloat(r.gmTarget) });
    }
    mutation.mutate(apiRows);
  }

  function addRow() { setRows(prev => [...prev, emptyClientRow()]); }
  function removeRow(i: number) { setRows(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<ClientRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  // Summary totals
  const totRevActual = rows.reduce((s, r) => s + (parseFloat(r.revActual) || 0), 0);
  const totRevTarget = rows.reduce((s, r) => s + (parseFloat(r.revTarget) || 0), 0);
  const totGmActual  = rows.reduce((s, r) => s + (parseFloat(r.gmActual) || 0), 0);
  const totGmTarget  = rows.reduce((s, r) => s + (parseFloat(r.gmTarget) || 0), 0);

  const inputCls = 'w-full text-right font-mono border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white';

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Sales Entry by Client</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BU</label>
            <select
              value={selectedBu}
              onChange={e => { setSelectedBu(e.target.value); setEntiteId(null); }}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            >
              {BU_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entity</label>
            <select
              value={entiteId ?? ''}
              onChange={e => setEntiteId(parseInt(e.target.value) || null)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            >
              <option value="">Select…</option>
              {entites.map(e => <option key={e.id} value={e.id}>{e.nomCourt}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</label>
            <select
              value={month}
              onChange={e => setMonth(parseInt(e.target.value))}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            >
              {MONTHS_EN.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year</label>
            <input
              type="number"
              value={year}
              onChange={e => setYear(parseInt(e.target.value) || annee)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {entiteId && (
        <>
          {/* Entry grid */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                Revenue &amp; Gross Margin by Client
              </span>
              <span className="text-xs text-gray-400">{MONTHS_EN[month - 1]} {year} · EUR</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50/60 border-b">
                    <th className="text-left px-3 py-2.5 font-semibold text-gray-500 min-w-52">Client</th>
                    <th className="text-right px-2 py-2.5 font-semibold text-gray-500 min-w-[120px]">Rev. Actual</th>
                    <th className="text-right px-2 py-2.5 font-semibold text-gray-500 min-w-[120px]">Rev. Target</th>
                    <th className="text-right px-2 py-2.5 font-semibold text-gray-500 min-w-[120px]">GM Actual</th>
                    <th className="text-right px-2 py-2.5 font-semibold text-gray-500 min-w-[120px]">GM Target</th>
                    <th className="w-8 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/30">
                      <td className="px-3 py-1.5">
                        <input
                          value={row.clientNom}
                          onChange={e => updateRow(i, { clientNom: e.target.value })}
                          placeholder="Client name…"
                          className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.revActual} onChange={e => updateRow(i, { revActual: e.target.value })} placeholder="0" className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.revTarget} onChange={e => updateRow(i, { revTarget: e.target.value })} placeholder="0" className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.gmActual} onChange={e => updateRow(i, { gmActual: e.target.value })} placeholder="0" className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.gmTarget} onChange={e => updateRow(i, { gmTarget: e.target.value })} placeholder="0" className={inputCls} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {rows.length > 1 && (
                          <button
                            onClick={() => removeRow(i)}
                            className="p-0.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals footer */}
                {rows.filter(r => r.clientNom.trim()).length > 1 && (
                  <tfoot>
                    <tr className="bg-blue-50/60 border-t-2 border-blue-200 font-semibold">
                      <td className="px-3 py-2 text-xs text-blue-900">TOTAL</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-900 text-xs">{fmt(totRevActual)}</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-900 text-xs">{fmt(totRevTarget)}</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-900 text-xs">{fmt(totGmActual)}</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-900 text-xs">{fmt(totGmTarget)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="px-4 py-2.5 border-t bg-gray-50/40">
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-xs text-[#1B3A6B] hover:text-[#00A3B4] font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add client
              </button>
            </div>
          </div>

          {/* Save bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="flex items-center gap-2 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1B3A6B]/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Saving…' : `Save — ${MONTHS_EN[month - 1]} ${year}`}
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Sales data saved
              </div>
            )}
            <span className="ml-auto text-xs text-gray-400">
              {rows.filter(r => r.clientNom.trim()).length} client{rows.filter(r => r.clientNom.trim()).length !== 1 ? 's' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
