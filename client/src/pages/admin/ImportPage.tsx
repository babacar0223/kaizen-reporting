import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Upload, CheckCircle, AlertCircle, Download, FileSpreadsheet,
  Loader2, X, Zap, RotateCcw, ChevronDown, ChevronRight, ArrowRight, Eye,
} from 'lucide-react';
import api from '../../lib/api';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';
import { useQuery } from '@tanstack/react-query';
import type { ImportResult, PreviewResult, ClientPreviewRow } from '../../types';

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FR = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];

// Procurement / Freight Forwarding / Logistics par BU (anciens formats dédiés) retirés de la
// sélection : plus utilisés, tout import se fait désormais entité par entité via Template Auto
// (fichier récupéré depuis Browse) — les garder visibles prêtait à confusion pour les chargés
// d'importation des entités.
const BU_OPTIONS = [
  { value: 'TEMPLATE', label: 'Template Auto', color: 'from-[#B45309] to-[#D97706]', isTemplate: true },
];

const BU_LABELS: Record<string, string> = {
  PROCUREMENT: 'Procurement', FREIGHT_FORWARDING: 'Freight Forwarding', LOGISTICS: 'Logistics',
};

const SUBTOTALS = new Set(['Gross Margin','Other Operating Charges','Other Current Revenues','EBITDA','Operating Income','Net Cost of Debt','Other Financial Gain & Loss','Profit Before Tax']);
const TOTALS = new Set(['Net Earnings','Cash Flow']);

// Formate le suffixe "(÷taux)" affiché près de la devise. Affiche les 3 taux séparément dès que
// Budget et/ou YTD N-1 diffèrent du taux Actuals (colonnes de la feuille "PL" — voir readCustomRates
// côté serveur), pour ne jamais laisser croire qu'un seul taux uniforme a été appliqué.
function fmtRate(n: number): string {
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}
function rateSuffix(devise?: string, taux?: number, tauxBudget?: number, tauxN1?: number): string {
  if (!devise || devise === 'EUR' || !taux || taux === 1) return '';
  const parts = [`Actuals ÷${fmtRate(taux)}`];
  if (tauxBudget !== undefined) parts.push(`Budget ÷${fmtRate(tauxBudget)}`);
  if (tauxN1 !== undefined) parts.push(`N-1 ÷${fmtRate(tauxN1)}`);
  return parts.length > 1 ? ` (${parts.join(', ')})` : ` (÷${fmtRate(taux)})`;
}

function fmtK(v: number) {
  const k = Math.round(v / 1000);
  if (k === 0) return '—';
  return k.toLocaleString('fr-FR') + ' K€';
}

function fmtPct(v: number | null) {
  if (v === null || v === undefined) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtStatVal(v: number, nom: string): string {
  if (nom.endsWith('(%)')) {
    if (v === 0) return '—';
    return (v * 100).toFixed(1) + '%';
  }
  if (nom === 'Staff Number') {
    if (v === 0) return '—';
    return Math.round(v).toLocaleString('fr-FR');
  }
  return fmtK(v);
}

export default function ImportPage() {
  const { annee, mois } = useFiltersStore();
  const { user } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bu, setBu]             = useState('TEMPLATE');
  const [year, setYear]         = useState(annee);
  const [month, setMonth]       = useState(mois);
  const [nomCourt, setNomCourt] = useState('');
  const [loading, setLoading]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [showReset, setShowReset] = useState(false);

  const [preview, setPreview]             = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTab, setPreviewTab]       = useState<'pl' | 'clients'>('pl');
  const [showOverhead, setShowOverhead]   = useState(false);
  const [showStats, setShowStats]         = useState(false);

  // Reset section state
  const [resetBu, setResetBu]     = useState('PROCUREMENT');
  const [resetEntiteId, setResetEntiteId] = useState<number | null>(null);
  const [resetYear, setResetYear] = useState(annee);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState<{ plDeleted: number; salesDeleted: number } | null>(null);

  const currentBu = BU_OPTIONS.find(b => b.value === bu) || BU_OPTIONS[0];
  const isTemplate = currentBu.isTemplate;

  const { data: resetEntites = [] } = useQuery({
    queryKey: ['entites', resetBu],
    queryFn: () => referentielService.getEntites(resetBu),
    enabled: showReset,
  });

  const { data: myEntites = [] } = useQuery({
    queryKey: ['entites-mine'],
    queryFn: () => referentielService.getEntites(),
    enabled: isViewer && bu === 'LOGISTICS',
  });

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/admin/template/monthly', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'pl_entry_template.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally { setDownloading(false); }
  };

  const runPreview = async (file: File) => {
    setPreview(null);
    setPreviewLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('annee', String(year));
      const res = await api.post<PreviewResult>('/admin/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data);
      setPreviewTab('pl');
      setShowOverhead(false);
    } catch { setPreview(null); } finally { setPreviewLoading(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file?.name || '');
    setResult(null);
    setPreview(null);
    if (file && isTemplate) runPreview(file);
  };

  const handleImport = async () => {
    if (!fileRef.current?.files?.[0]) return;
    setLoading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current.files[0]);
      fd.append('annee', String(year));
      fd.append('mois', String(month));
      if (bu === 'LOGISTICS') fd.append('nomCourt', nomCourt);
      const res = await api.post<ImportResult>(`/admin/import/${bu}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      setPreview(null);
      // Rafraîchir le cache dès qu'une ligne a réellement été écrite — une erreur sur UNE ligne/mois
      // (ex. un caractère non numérique isolé) ne doit pas empêcher l'affichage des centaines d'autres
      // lignes correctement importées dans le même fichier (sinon la plateforme montre encore les
      // anciennes valeurs malgré un import réussi pour la quasi-totalité des données).
      if ((res.data.created ?? 0) > 0 || (res.data.updated ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ['pl-bu'] });
        qc.invalidateQueries({ queryKey: ['kpi'] });
        qc.invalidateQueries({ queryKey: ['pl-saisie'] });
        qc.invalidateQueries({ queryKey: ['pl-entite-mensuel'] });
        qc.invalidateQueries({ queryKey: ['stats'] });
        qc.invalidateQueries({ queryKey: ['sales'] });
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Import error';
      setResult({ created: 0, updated: 0, errors: [msg] });
    } finally { setLoading(false); }
  };

  const handleUndoImport = async () => {
    if (!result?.entiteId) return;
    setResetting(true);
    try {
      const r = await plService.resetEntityPl(result.entiteId, year);
      setResetDone(r);
      setResult(null);
      qc.invalidateQueries({ queryKey: ['pl-bu'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    } catch { /* ignore */ } finally { setResetting(false); }
  };

  const handleResetSection = async () => {
    if (!resetEntiteId) return;
    setResetting(true); setResetDone(null);
    try {
      const r = await plService.resetEntityPl(resetEntiteId, resetYear);
      setResetDone(r);
      qc.invalidateQueries({ queryKey: ['pl-bu'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    } catch { /* ignore */ } finally { setResetting(false); }
  };

  const clearFile = () => {
    setFileName('');
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasErrors = (result?.errors?.length ?? 0) > 0;
  const isSuccess = result && !hasErrors;
  const showPreviewPanel = isTemplate && (previewLoading || !!preview);

  const clientLines: ClientPreviewRow[] = preview?.clientLines ?? [];

  return (
    <div className={`flex gap-6 items-start ${showPreviewPanel ? 'w-full' : 'max-w-2xl'}`}>

      {/* ── LEFT: form (fixed width) ── */}
      <div className="w-[520px] flex-shrink-0 space-y-5">

        {/* BU Selector */}
        <div className="space-y-2">
          {(() => {
            const t = BU_OPTIONS[0];
            const active = bu === t.value;
            return (
              <button onClick={() => setBu(t.value)}
                className={`relative overflow-hidden w-full rounded-xl border-2 p-4 text-left transition-all ${
                  active ? 'border-transparent shadow-md' : 'border-amber-200 bg-amber-50 hover:border-amber-300'
                }`}>
                {active && <div className={`absolute inset-0 bg-gradient-to-br ${t.color}`} />}
                <div className="relative flex items-center gap-3">
                  <Zap className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : 'text-amber-600'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>Recommandé</span>
                    </div>
                    <p className={`mt-0.5 text-sm font-bold ${active ? 'text-white' : 'text-amber-800'}`}>{t.label}</p>
                    <p className={`text-xs ${active ? 'text-white/70' : 'text-amber-600'}`}>
                      «&nbsp;PL&nbsp;» + «&nbsp;PL clients&nbsp;» sheets — BU, entity &amp; month auto-detected
                    </p>
                  </div>
                </div>
              </button>
            );
          })()}
        </div>

        {/* Main import card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className={`bg-gradient-to-r ${currentBu.color} px-6 py-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                {isTemplate ? <Zap className="w-5 h-5 text-white" /> : <FileSpreadsheet className="w-5 h-5 text-white" />}
              </div>
              <div>
                <p className="text-white font-bold">{isTemplate ? 'Auto Template Import' : `Import ${BU_LABELS[bu] ?? bu}`}</p>
                <p className="text-white/60 text-xs">
                  {isTemplate ? 'BU, entity & month auto-detected from the file' : 'Manual import by BU'}
                </p>
              </div>
            </div>
            <button onClick={handleDownloadTemplate} disabled={downloading}
              className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {downloading ? 'Downloading…' : 'Download Template'}
            </button>
          </div>

          <div className="p-6 space-y-4">
            {!isTemplate && (
              <div className={`grid gap-4 ${bu === 'LOGISTICS' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Year</label>
                  <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} min={2024} max={2030}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Month</label>
                  <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
                    {MONTHS_EN.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                {bu === 'LOGISTICS' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Entity code</label>
                    {isViewer ? (
                      <select value={nomCourt} onChange={e => setNomCourt(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
                        <option value="">Select…</option>
                        {myEntites.map(e => <option key={e.id} value={e.nomCourt}>{e.nomCourt}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={nomCourt} onChange={e => setNomCourt(e.target.value)}
                        placeholder="e.g. CSTT, AM…"
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" />
                    )}
                  </div>
                )}
              </div>
            )}

            {isTemplate && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>Select BU in A1 and entity in A2</strong> in the «&nbsp;PL clients&nbsp;» sheet.
                Year, months and entity are <strong>read automatically</strong>.
              </p>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">Excel file (.xlsx)</label>
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  fileName ? 'border-[#00A3B4] bg-teal-50' : 'border-gray-200 hover:border-[#00A3B4] hover:bg-gray-50'
                }`}
                onClick={() => !fileName && fileRef.current?.click()}
              >
                {fileName ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-[#00A3B4] flex-shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[#00A3B4]">{fileName}</p>
                      <p className="text-xs text-gray-400">{previewLoading ? 'Analyzing…' : 'Ready to import'}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); clearFile(); }}
                      className="ml-2 p-1 rounded-full hover:bg-teal-100 text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">Drop your file or <span className="text-[#00A3B4] font-semibold">browse</span></p>
                    <p className="text-xs text-gray-300 mt-1">.xlsx — max 20 Mo</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
              </div>
            </div>

            {isTemplate && (preview?.mandatoryWarnings?.length ?? 0) > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>Import blocked:</strong> fill in these mandatory lines in the «&nbsp;PL&nbsp;» sheet for
                the reference month, then re-upload the file —
                <span className="font-semibold"> {preview!.mandatoryWarnings!.join(', ')}</span>.
              </div>
            )}

            {isTemplate && (preview?.parseWarnings?.length ?? 0) > 0 && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <strong>{preview!.parseWarnings!.length} non-numeric cell(s)</strong> (text) will be imported as 0.
                Fix them to avoid skewing the totals:
                <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                  {preview!.parseWarnings!.map((w, i) => <li key={i}>• {w}</li>)}
                </ul>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={loading || !fileName || (bu === 'LOGISTICS' && !nomCourt) || (isTemplate && (preview?.mandatoryWarnings?.length ?? 0) > 0)}
              className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r ${currentBu.color} text-white py-3 rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity shadow-md`}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Run import</>}
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-2xl border p-5 ${hasErrors ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="flex items-center gap-2.5 mb-4">
              {hasErrors
                ? <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center"><AlertCircle className="w-5 h-5 text-red-500" /></div>
                : <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>}
              <div>
                <p className={`font-bold text-sm ${hasErrors ? 'text-red-800' : 'text-green-800'}`}>
                  {hasErrors ? 'Import finished with errors' : 'Import successful'}
                </p>
                {isSuccess && result.entiteNom && (
                  <p className="text-xs text-green-700 mt-0.5">
                    {BU_LABELS[result.bu ?? ''] ?? result.bu} · {result.entiteNom} · {result.annee ?? year}
                    {result.devise && result.devise !== 'EUR' && ` · ${result.devise} → EUR${rateSuffix(result.devise, result.tauxDevise, result.tauxDeviseBudget, result.tauxDeviseN1)}`}
                  </p>
                )}
              </div>
            </div>
            {isSuccess && result.detectedMonths && result.detectedMonths.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs text-green-700 font-semibold">Imported months:</span>
                {result.detectedMonths.map(m => (
                  <span key={m} className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">{MONTHS_EN[m - 1]}</span>
                ))}
                {result.referenceMois && (
                  <span className="ml-1 text-xs text-green-600">· YTD ref. <strong>{MONTHS_EN[result.referenceMois - 1]}</strong></span>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Created',  value: result.created,       color: 'text-green-700 bg-green-100' },
                { label: 'Updated',  value: result.updated,       color: 'text-blue-700 bg-blue-100'   },
                { label: 'Errors',   value: result.errors.length, color: 'text-red-700 bg-red-100'     },
              ].map(s => (
                <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-xs font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <ul className="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto bg-red-100/50 rounded-lg p-3 mb-4">
                {result.errors.map((e, i) => <li key={i} className="flex gap-1.5"><span className="text-red-400">•</span>{e}</li>)}
              </ul>
            )}
            {(result.parseWarnings?.length ?? 0) > 0 && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="font-semibold text-amber-800 mb-1">
                  {result.parseWarnings!.length} non-numeric cell(s) imported as 0 — fix them in the file then re-run the import (it overwrites the values, no need to delete anything):
                </p>
                <ul className="text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.parseWarnings!.map((w, i) => <li key={i} className="flex gap-1.5"><span className="text-amber-400">•</span>{w}</li>)}
                </ul>
              </div>
            )}
            {isSuccess && (
              <div className="flex items-center gap-3 pt-1 border-t border-green-200/60">
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Go to <strong>Figures</strong> to view the data
                </div>
                {result.entiteId && (
                  <button onClick={handleUndoImport} disabled={resetting}
                    className="ml-auto flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-semibold px-2.5 py-1 rounded-lg border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50">
                    {resetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Undo this import
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {resetDone && !result && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-orange-800 text-sm font-semibold mb-1">
              <RotateCcw className="w-4 h-4" /> Data deleted
            </div>
            <p className="text-xs text-orange-700">
              {resetDone.plDeleted} P&L rows and {resetDone.salesDeleted} client rows deleted.
            </p>
          </div>
        )}

        {/* Reset section — admin only (action destructive) */}
        {!isViewer && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <button onClick={() => setShowReset(s => !s)}
            className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">Reset imported data</span>
            </div>
            {showReset ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
          {showReset && (
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Deletes all P&L and client data for the entity for a given year. <strong>Irreversible</strong>.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">BU</label>
                  <select value={resetBu} onChange={e => { setResetBu(e.target.value); setResetEntiteId(null); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
                    <option value="PROCUREMENT">Procurement</option>
                    <option value="FREIGHT_FORWARDING">Freight Fwd</option>
                    <option value="LOGISTICS">Logistics</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Entity</label>
                  <select value={resetEntiteId ?? ''} onChange={e => setResetEntiteId(parseInt(e.target.value) || null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none">
                    <option value="">Select…</option>
                    {resetEntites.map(e => <option key={e.id} value={e.id}>{e.nomCourt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Year</label>
                  <input type="number" value={resetYear} onChange={e => setResetYear(parseInt(e.target.value))} min={2020} max={2030}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none" />
                </div>
              </div>
              <button onClick={handleResetSection} disabled={resetting || !resetEntiteId}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors">
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {resetting ? 'Deleting…' : 'Delete data'}
              </button>
              {resetDone && (
                <p className="text-xs text-green-700 font-medium">
                  ✓ {resetDone.plDeleted} P&L rows + {resetDone.salesDeleted} client rows deleted.
                </p>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── RIGHT: preview panel (full remaining width) ── */}
      {showPreviewPanel && (
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 120px)' }}>

            {/* Header */}
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-3.5 flex items-center gap-3 flex-shrink-0">
              <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
                <Eye className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">File preview</p>
                {preview && !preview.errors.length && (
                  <p className="text-white/60 text-xs truncate">
                    {BU_LABELS[preview.bu ?? ''] ?? preview.bu} · {preview.entiteNom} · {preview.annee}
                    {preview.devise && preview.devise !== 'EUR' && ` · entered in ${preview.devise}, converted to EUR${rateSuffix(preview.devise, preview.tauxDevise, preview.tauxDeviseBudget, preview.tauxDeviseN1)}`}
                  </p>
                )}
              </div>
              {preview && !preview.errors.length && (
                <div className="flex gap-1">
                  {preview.detectedMonths?.map(m => (
                    <span key={m} className="bg-white/15 text-white/90 text-xs font-semibold px-2 py-0.5 rounded-full">{MONTHS_FR[m - 1]}</span>
                  ))}
                </div>
              )}
            </div>

            {previewLoading && (
              <div className="flex items-center gap-3 py-12 justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm text-gray-400">Analyzing file…</span>
              </div>
            )}

            {preview && preview.errors.length > 0 && (
              <div className="p-5 space-y-1">
                <p className="text-xs font-semibold text-red-600 mb-2">Errors detected</p>
                {preview.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
                ))}
              </div>
            )}

            {preview && !preview.errors.length && (
              <>
                {/* Tabs */}
                <div className="flex border-b border-gray-200 flex-shrink-0 px-1">
                  {[
                    { key: 'pl' as const, label: `P&L (${preview.lines.length + (preview.statsLines?.length ?? 0) + preview.overheadLines.length} lignes)` },
                    { key: 'clients' as const, label: `Clients (${clientLines.length})` },
                  ].map(t => (
                    <button key={t.key} onClick={() => setPreviewTab(t.key)}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                        previewTab === t.key ? 'border-slate-700 text-slate-800' : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {/* ── P&L TAB ── */}
                  {previewTab === 'pl' && (() => {
                    const months = preview.detectedMonths ?? [];
                    const colSpan = months.length + 4; // label + Budget + months + YTD + N-1
                    const statsLines = preview.statsLines ?? [];
                    return (
                      <div>
                        <div className="overflow-x-auto">
                          <table className="text-xs w-full">
                            <thead className="sticky top-0 bg-gray-50 z-10">
                              <tr className="border-b border-gray-200">
                                <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-600 min-w-[220px]">Ligne P&L</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Budget YTD</th>
                                {months.map(m => (
                                  <th key={m} className="text-right px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap">{MONTHS_FR[m - 1]}</th>
                                ))}
                                <th className="text-right px-3 py-2.5 font-bold text-teal-700 whitespace-nowrap border-l border-gray-200">YTD Total</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-400 whitespace-nowrap">YTD N-1</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* ── Main P&L rows ── */}
                              {preview.lines.map(line => {
                                const ytd = months.reduce((s, m) => s + (line.months[m] ?? 0), 0);
                                const isSubtotal = SUBTOTALS.has(line.nom);
                                const isTotal = TOTALS.has(line.nom);
                                const rowCls = isTotal
                                  ? 'bg-indigo-50/60 font-bold border-b-2 border-indigo-100'
                                  : isSubtotal
                                  ? 'bg-blue-50/40 font-semibold border-b border-blue-100'
                                  : 'border-b border-gray-50 hover:bg-gray-50/50';
                                const stickyBg = isTotal ? 'bg-indigo-50/60' : isSubtotal ? 'bg-blue-50/40' : 'bg-white';
                                return (
                                  <tr key={line.nom} className={rowCls}>
                                    <td className={`sticky left-0 px-3 py-1.5 text-gray-700 ${stickyBg}`}>{line.nom}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtK(line.budget)}</td>
                                    {months.map(m => (
                                      <td key={m} className="px-3 py-1.5 text-right tabular-nums text-gray-800 whitespace-nowrap">
                                        {fmtK(line.months[m] ?? 0)}
                                      </td>
                                    ))}
                                    <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-gray-100 ${isTotal ? 'text-indigo-700' : isSubtotal ? 'text-blue-700' : 'text-teal-700 font-semibold'}`}>
                                      {fmtK(ytd)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtK(line.ytdN1)}</td>
                                  </tr>
                                );
                              })}

                              {/* ── Statistics & Ratios section ── */}
                              {statsLines.length > 0 && (
                                <tr className="border-t-2 border-gray-200 bg-amber-50/60">
                                  <td colSpan={colSpan} className="px-3 py-0">
                                    <button
                                      onClick={() => setShowStats(s => !s)}
                                      className="w-full flex items-center justify-between py-2.5 text-xs font-bold text-amber-800 uppercase tracking-wide hover:text-amber-900 transition-colors"
                                    >
                                      <span>Statistiques &amp; Ratios ({statsLines.length} lignes)</span>
                                      {showStats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                  </td>
                                </tr>
                              )}
                              {showStats && statsLines.map(line => {
                                // Ratios, %, staff, per-staff: show latest month (not sum)
                                const isPoint = line.nom.endsWith('(%)') || line.nom === 'Staff Number' || line.nom.includes('per Staff');
                                const ytdVal = months.length > 0
                                  ? (isPoint
                                      ? (line.months[Math.max(...months)] ?? 0)
                                      : months.reduce((s, m) => s + (line.months[m] ?? 0), 0))
                                  : 0;
                                const ytd = months.length > 0 ? fmtStatVal(ytdVal, line.nom) : '—';
                                return (
                                  <tr key={line.nom} className="border-b border-amber-50 hover:bg-amber-50/30 bg-amber-50/10">
                                    <td className="sticky left-0 bg-amber-50/10 px-3 py-1.5 text-gray-700 pl-5">{line.nom}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtStatVal(line.budget, line.nom)}</td>
                                    {months.map(m => (
                                      <td key={m} className="px-3 py-1.5 text-right tabular-nums text-gray-800 whitespace-nowrap">
                                        {fmtStatVal(line.months[m] ?? 0, line.nom)}
                                      </td>
                                    ))}
                                    <td className="px-3 py-1.5 text-right tabular-nums text-amber-700 whitespace-nowrap border-l border-gray-100">{ytd}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtStatVal(line.ytdN1, line.nom)}</td>
                                  </tr>
                                );
                              })}

                              {/* ── Overhead Detail section ── */}
                              {preview.overheadLines.length > 0 && (
                                <tr className="border-t-2 border-gray-200 bg-gray-50">
                                  <td colSpan={colSpan} className="px-3 py-0">
                                    <button
                                      onClick={() => setShowOverhead(s => !s)}
                                      className="w-full flex items-center justify-between py-2.5 text-xs font-bold text-gray-600 uppercase tracking-wide hover:text-gray-800 transition-colors"
                                    >
                                      <span>Détail Overheads ({preview.overheadLines.length} lignes)</span>
                                      {showOverhead ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    </button>
                                  </td>
                                </tr>
                              )}
                              {showOverhead && preview.overheadLines.map(line => {
                                const ytd = months.reduce((s, m) => s + (line.months[m] ?? 0), 0);
                                return (
                                  <tr key={line.nom} className="border-b border-gray-50 hover:bg-gray-50/50">
                                    <td className="sticky left-0 bg-white px-3 py-1.5 text-gray-600 pl-5">{line.nom}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtK(line.budget)}</td>
                                    {months.map(m => (
                                      <td key={m} className="px-3 py-1.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
                                        {fmtK(line.months[m] ?? 0)}
                                      </td>
                                    ))}
                                    <td className="px-3 py-1.5 text-right tabular-nums text-teal-600 whitespace-nowrap border-l border-gray-100">{fmtK(ytd)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{fmtK(line.ytdN1)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <p className="text-xs text-gray-400 text-center py-3">
                          Values in K€{preview.devise && preview.devise !== 'EUR' ? ` · converted from ${preview.devise}${rateSuffix(preview.devise, preview.tauxDevise, preview.tauxDeviseBudget, preview.tauxDeviseN1)}` : ''} · Click «&nbsp;Run import&nbsp;» to confirm
                        </p>
                      </div>
                    );
                  })()}

                  {/* ── CLIENTS TAB ── */}
                  {previewTab === 'clients' && (
                    <div className="overflow-x-auto">
                      {preview.clientCols && (
                        <div className={`text-[11px] px-3 py-2 border-b ${preview.clientCols.budgetFound ? 'text-gray-500 bg-gray-50' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
                          Detected columns — Sales:&nbsp;<strong>{preview.clientCols.ventes}</strong> · COS:&nbsp;<strong>{preview.clientCols.cos}</strong> · Budget:&nbsp;<strong>{preview.clientCols.budget}</strong>
                          {!preview.clientCols.budgetFound && <> — <strong>no header named “Budget” was found</strong>, defaulting to column {preview.clientCols.budget}. Make sure the budget column has a header containing “Budget”.</>}
                        </div>
                      )}
                      {clientLines.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-12">No client found in the «&nbsp;PL clients&nbsp;» sheet</p>
                      ) : (
                        <table className="text-xs w-full">
                          <thead className="sticky top-0 bg-gray-50 z-10">
                            <tr className="border-b border-gray-200">
                              <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-600 min-w-[160px]">Client</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap">Sales YTD</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-gray-700 whitespace-nowrap">COS YTD</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap border-l border-gray-100">Margin YTD</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-blue-700 whitespace-nowrap">Margin rate</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">Budget {preview.clientCols ? `(col. ${preview.clientCols.budget})` : ''}</th>
                              <th className="text-right px-3 py-2.5 font-semibold text-gray-400 whitespace-nowrap">Months</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientLines.map(cl => (
                              <tr key={cl.clientNom} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-gray-700">{cl.clientNom}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 whitespace-nowrap font-semibold">{fmtK(cl.ventesYtd)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 whitespace-nowrap">{fmtK(cl.cosYtd)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 whitespace-nowrap border-l border-gray-100 font-semibold">{fmtK(cl.margeYtd)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 whitespace-nowrap">{fmtPct(cl.tauxMarge)}</td>
                                <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${cl.budgetAnnuel ? 'text-violet-700' : 'text-gray-300'}`}>{fmtK(cl.budgetAnnuel)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-400 whitespace-nowrap">{cl.months.length}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="text-xs text-gray-400 text-center py-3">
                        Values in K€ · Margin = Sales − COS · Click «&nbsp;Run import&nbsp;» to confirm
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
