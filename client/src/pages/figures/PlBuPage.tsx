import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { plService } from '../../services/pl.service';
import { referentielService } from '../../services/referentiel.service';
import { formatEur, formatPct } from '../../lib/utils';
import { AlertCircle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import EntityMonthlyTable, { type PlRawRow } from '../../components/pl/EntityMonthlyTable';
import ScopeSelector, { type Scope } from '../../components/layout/ScopeSelector';
import MultiBuSynthesisTable from '../../components/pl/MultiBuSynthesisTable';
import { exportConsolidatedPlPdf, type KpiLine } from '../../lib/figuresPdf';
import type { DimEntite } from '../../types';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KEY_LINES = ['Revenue', 'Gross Margin', 'EBITDA', 'Net Earnings'];

const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement',        shortCode: 'PROC', color: '#1B5E8B' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Forwarding',  shortCode: 'FF',   color: '#4A1E8B' },
  { value: 'LOGISTICS',          label: 'Logistics',           shortCode: 'LOG',  color: '#0E6B5E' },
];
const SHORT_TO_BU: Record<string, string> = Object.fromEntries(BU_OPTIONS.map(b => [b.shortCode, b.value]));

// Carte de consolidation BU — reprend le même appel plService.getKpiBu que Dashboard/Statistics/
// MultiBuSynthesisTable, pour garantir que les montants affichés ici correspondent exactement
// aux autres modules (aucun recalcul indépendant à partir des lignes brutes par entité).
function BuConsolidatedCard({ bu, annee, mois }: { bu: string; annee: number; mois: number }) {
  const label = BU_OPTIONS.find(b => b.value === bu)?.label ?? bu;
  const color = BU_OPTIONS.find(b => b.value === bu)?.color ?? '#1B3A6B';
  const { data, isLoading } = useQuery({
    queryKey: ['kpi', bu, annee, mois],
    queryFn: () => plService.getKpiBu(bu, annee, mois),
  });
  const kpis = data?.kpis || {};

  return (
    <div className="rounded-xl shadow-md overflow-hidden" style={{ backgroundColor: color }}>
      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-white font-bold text-sm">Consolidé {label}</p>
        <span className="text-white/60 text-xs">Total de toutes les entités</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 pt-0">
        {KEY_LINES.map(line => {
          const act = kpis[line]?.ACTUALS || 0;
          // Budget YTD importé = déjà cumulé jusqu'au mois de référence de l'entité (comme YTD N-1) —
          // ne JAMAIS le re-proratiser par une plage de mois choisie côté écran (voir StatisticsPage,
          // seule vue qui l'utilisait déjà correctement tel quel).
          const tgt = kpis[line]?.TARGET || 0;
          // % d'atteinte (Actuals/Budget) plutôt que l'écart restant — plus lisible. La couleur reste
          // basée sur act >= tgt (vrai indicateur de performance, y compris pour un budget négatif
          // comme EBITDA/Net Earnings, où act/tgt >= 1 s'inverserait autrement).
          const achievement = tgt !== 0 ? act / tgt : null;
          const good = act >= tgt;
          return (
            <div key={line} className="bg-white/10 rounded-lg p-3">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-wide mb-1">{line}</p>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="text-white text-lg font-black">{isLoading ? '…' : formatEur(act, true)}</p>
                <p className="text-white/50 text-[11px] font-semibold">| Budget {isLoading ? '…' : formatEur(tgt, true)}</p>
              </div>
              <p className={`text-xs font-semibold mt-0.5 ${tgt !== 0 ? (good ? 'text-teal-300' : 'text-red-300') : 'text-white/40'}`}>
                {achievement !== null ? `${formatPct(achievement)} achievement` : '—'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntitySection({ entite, buLabel }: { entite: DimEntite; buLabel: string }) {
  const { annee, mois, moisMin } = useFiltersStore();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pl-entite-mensuel', entite.id, annee],
    queryFn: () => plService.getPlEntite(buLabel, entite.id, annee, 12),
  });

  const rows: PlRawRow[] = (data as { data?: PlRawRow[] } | undefined)?.data ?? [];

  // typePeriode doit toujours accompagner typeValeur : 'ACTUALS' existe en MTD (valeur mensuelle,
  // ce qu'on veut) et, pour certaines entités Procurement/Freight Forwarding importées via l'ancien
  // flux BU dédié, en YTD (une ligne à 0 réservée à un usage différent) — sans ce filtre .find()
  // peut retourner cette autre ligne au lieu du vrai montant du mois.
  function sumRange(nom: string): number {
    let s = 0;
    for (let m = moisMin; m <= mois; m++) {
      s += Number(rows.find(r => r.lignePl.nom === nom && r.mois === m && r.typeValeur === 'ACTUALS' && r.typePeriode === 'MTD')?.montant) || 0;
    }
    return s;
  }
  // Budget YTD importé = déjà cumulé jusqu'au mois de référence de l'entité — à utiliser tel quel,
  // jamais reproratisé par la plage de mois sélectionnée à l'écran (moisMin/mois).
  function budgetYtd(nom: string): number {
    const targets = rows.filter(r => r.lignePl.nom === nom && r.typeValeur === 'TARGET' && r.typePeriode === 'YTD');
    if (!targets.length) return 0;
    return Number(targets.sort((a, b) => b.mois - a.mois)[0].montant);
  }

  // % d'atteinte (Actuals/Budget) plutôt que l'écart restant, comme partout ailleurs dans Figures.
  // Couleur basée sur actuals >= budget (correct même pour un budget négatif — EBITDA/Net Earnings).
  const lineStats = KEY_LINES.map(nom => {
    const actuals = sumRange(nom);
    const budget = budgetYtd(nom);
    const achievement = budget !== 0 ? actuals / budget : null;
    return { nom, actuals, budget, achievement, good: actuals >= budget };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-start justify-between gap-4 px-4 py-3 hover:bg-gray-50/70 transition-colors">
        <div className="flex items-center gap-2.5 pt-0.5">
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="font-bold text-gray-900 text-sm">{entite.nom}</span>
          <span className="text-xs text-gray-400">({entite.nomCourt})</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-4">
            <span className="w-28" />
            <span className="w-24 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Actuals</span>
            <span className="w-24 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Budget</span>
            <span className="w-20 text-right text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Achievement</span>
          </div>
          {lineStats.map(s => (
            <div key={s.nom} className="flex items-center gap-4 text-xs">
              <span className="w-28 text-left text-gray-600 font-medium truncate">{s.nom}</span>
              <span className="w-24 text-right font-mono font-semibold text-gray-800">{isLoading ? '…' : formatEur(s.actuals, true)}</span>
              <span className="w-24 text-right font-mono text-gray-500">{isLoading ? '…' : formatEur(s.budget, true)}</span>
              <span className={`w-20 text-right font-mono font-semibold ${s.budget !== 0 ? (s.good ? 'text-green-600' : 'text-red-600') : 'text-gray-300'}`}>
                {s.achievement !== null ? formatPct(s.achievement) : '—'}
              </span>
            </div>
          ))}
        </div>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading…</div>
          ) : (
            <EntityMonthlyTable rows={rows} moisMin={moisMin} mois={mois} />
          )}
        </div>
      )}
    </div>
  );
}

// Budget YTD (colonne C de la feuille PL) = déjà cumulé jusqu'au mois de référence de l'entité,
// exactement comme YTD N-1 (colonne B) — on l'utilise tel quel, sans reproratiser par la plage de
// mois affichée à l'écran.
function toKpiLines(kpis: Record<string, Record<string, number>>): KpiLine[] {
  return KEY_LINES.map(label => {
    const actuals = kpis[label]?.ACTUALS || 0;
    const budget = kpis[label]?.TARGET || 0;
    const achievement = budget !== 0 ? actuals / budget : null;
    return { label, actuals, budget, achievement };
  });
}

export default function PlBuPage() {
  const { annee, mois, moisMin } = useFiltersStore();
  const [scope, setScope] = useState<Scope>('PROCUREMENT');
  const [exporting, setExporting] = useState(false);

  const { data: allEntites = [], isLoading } = useQuery({
    queryKey: ['entites-figures', scope],
    queryFn: () => referentielService.getEntites(scope === 'GROUP' ? undefined : scope),
  });

  // Map each entity to its own BU label (needed for getPlEntite, since "Groupe" spans 3 BUs)
  const entitesWithBu = allEntites.map(e => ({ entite: e, buLabel: SHORT_TO_BU[e.bu?.nomCourt ?? ''] ?? scope }));

  const isYtd = moisMin === 1;
  const isSingle = moisMin === mois;
  const periodLabel = isYtd
    ? `YTD ${MONTHS_EN[mois - 1]} ${annee}`
    : isSingle
    ? `${MONTHS_EN[mois - 1]} ${annee}`
    : `${MONTHS_EN[moisMin - 1]} – ${MONTHS_EN[mois - 1]} ${annee} · ${mois - moisMin + 1}m`;

  const scopeLabel = scope === 'GROUP' ? 'Group' : BU_OPTIONS.find(b => b.value === scope)?.label ?? scope;

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const buList = scope === 'GROUP' ? BU_OPTIONS.map(b => b.value) : [scope];

      // Consolidé : somme des kpis de la/les BU du périmètre.
      const buKpis = await Promise.all(buList.map(b => plService.getKpiBu(b, annee, mois)));
      const mergedKpis: Record<string, Record<string, number>> = {};
      for (const res of buKpis) {
        for (const [line, vals] of Object.entries(res.kpis || {})) {
          mergedKpis[line] = mergedKpis[line] || {};
          for (const [tv, v] of Object.entries(vals)) mergedKpis[line][tv] = (mergedKpis[line][tv] || 0) + v;
        }
      }

      const perEntity = await Promise.all(
        entitesWithBu.map(async ({ entite, buLabel }) => {
          const res = await plService.getKpiBu(buLabel, annee, mois, entite.id);
          return { nom: entite.nom, nomCourt: entite.nomCourt, lines: toKpiLines(res.kpis || {}) };
        }),
      );
      perEntity.sort((a, b) => (b.lines[0]?.actuals ?? 0) - (a.lines[0]?.actuals ?? 0));

      exportConsolidatedPlPdf({
        orgName: 'CSTT AO',
        scopeLabel,
        periodLabel,
        consolidated: toKpiLines(mergedKpis),
        entities: perEntity,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Consolidated P&L</h2>
          <p className="text-sm text-gray-400">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ScopeSelector value={scope} onChange={setScope} />
          <button
            onClick={handleExportPdf}
            disabled={exporting || isLoading || entitesWithBu.length === 0}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exporting ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
      ) : entitesWithBu.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-800">No entities found for this scope</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entitesWithBu.map(({ entite, buLabel }) => (
            <EntitySection key={entite.id} entite={entite} buLabel={buLabel} />
          ))}
        </div>
      )}

      {/* ── Consolidé (toujours en bas, sous une autre couleur) ── */}
      {!isLoading && entitesWithBu.length > 0 && (
        scope === 'GROUP' ? (
          <MultiBuSynthesisTable
            annee={annee}
            mois={mois}
            moisMin={moisMin}
            title="Synthèse Groupe"
            subtitle="Consolidé des 3 BU — mêmes montants que Dashboard / Multi-BU / Statistics"
          />
        ) : (
          <BuConsolidatedCard bu={scope} annee={annee} mois={mois} />
        )
      )}
    </div>
  );
}
