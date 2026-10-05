import { Fragment, useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tresorerieService } from '../../services/tresorerie.service';
import { useAuthStore } from '../../stores/auth.store';
import { formatNumber } from '../../lib/utils';
import { Save, CheckCircle, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { TresorerieSaisieRow, TresorerieMouvement } from '../../types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type EditableRow = TresorerieSaisieRow;

function recompute(row: EditableRow): EditableRow {
  const detailed = row.mouvements.length > 0;
  const entrees = detailed ? row.mouvements.filter(m => m.type === 'ENTREE').reduce((s, m) => s + m.montant, 0) : row.entrees;
  const sorties = detailed ? row.mouvements.filter(m => m.type === 'SORTIE').reduce((s, m) => s + m.montant, 0) : row.sorties;
  return { ...row, entrees, sorties, positionJ: row.positionJMoins1 + entrees - sorties };
}

export default function SaisieTresoreriePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [entiteId, setEntiteId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, EditableRow>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);

  const { data: entites = [] } = useQuery({
    queryKey: ['tresorerie-entites'],
    queryFn: tresorerieService.getEntites,
  });

  const { data: saisieJour, isFetching } = useQuery({
    queryKey: ['tresorerie-saisie', date, entiteId],
    queryFn: () => tresorerieService.getSaisieJour(date, entiteId!),
    enabled: !!entiteId,
  });

  useEffect(() => {
    if (!saisieJour) return;
    const byId: Record<number, EditableRow> = {};
    for (const r of saisieJour.rows) byId[r.banqueId] = { ...r };
    setRows(byId);
  }, [saisieJour]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = Object.values(rows).map(r => ({
        banqueId: r.banqueId,
        positionJMoins1: r.positionJMoins1,
        entrees: r.entrees,
        sorties: r.sorties,
        positionBanque: r.positionBanque,
        caisseJMoins1: r.caisseJMoins1,
        caisseJ: r.caisseJ,
        commentaire: r.commentaire,
        mouvements: r.mouvements.map(m => ({ type: m.type, montant: m.montant, libelle: m.libelle })),
      }));
      return tresorerieService.batchUpsertSaisie(date, entiteId!, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tresorerie-saisie'] });
      qc.invalidateQueries({ queryKey: ['tresorerie-dashboard'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function updateRow(banqueId: number, patch: Partial<EditableRow>) {
    setRows(prev => {
      const current = prev[banqueId];
      if (!current) return prev;
      return { ...prev, [banqueId]: recompute({ ...current, ...patch }) };
    });
  }

  function addMouvement(banqueId: number, type: 'ENTREE' | 'SORTIE') {
    setRows(prev => {
      const current = prev[banqueId];
      if (!current) return prev;
      const mouvements: TresorerieMouvement[] = [...current.mouvements, { type, montant: 0, libelle: '' }];
      return { ...prev, [banqueId]: recompute({ ...current, mouvements }) };
    });
    setExpanded(prev => ({ ...prev, [banqueId]: true }));
  }

  function updateMouvement(banqueId: number, index: number, patch: Partial<TresorerieMouvement>) {
    setRows(prev => {
      const current = prev[banqueId];
      if (!current) return prev;
      const mouvements = current.mouvements.map((m, i) => i === index ? { ...m, ...patch } : m);
      return { ...prev, [banqueId]: recompute({ ...current, mouvements }) };
    });
  }

  function removeMouvement(banqueId: number, index: number) {
    setRows(prev => {
      const current = prev[banqueId];
      if (!current) return prev;
      const mouvements = current.mouvements.filter((_, i) => i !== index);
      return { ...prev, [banqueId]: recompute({ ...current, mouvements }) };
    });
  }

  const rowList = useMemo(
    () => Object.values(rows).sort((a, b) => a.nomBanque.localeCompare(b.nomBanque)),
    [rows]
  );

  const totals = useMemo(() => {
    return rowList.reduce(
      (acc, r) => {
        acc.positionJXof += r.positionJ * r.tauxXofUtilise;
        acc.entreesXof += r.entrees * r.tauxXofUtilise;
        acc.sortiesXof += r.sorties * r.tauxXofUtilise;
        acc.ecartXof += (r.positionJ - r.positionBanque) * r.tauxXofUtilise;
        return acc;
      },
      { positionJXof: 0, entreesXof: 0, sortiesXof: 0, ecartXof: 0 }
    );
  }, [rowList]);

  const inputCls = 'w-full text-right font-mono border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Saisie journalière de trésorerie</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entité</label>
            <select
              value={entiteId ?? ''}
              onChange={e => setEntiteId(parseInt(e.target.value) || null)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#00A3B4] focus:outline-none"
            >
              <option value="">Sélectionner…</option>
              {entites.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
        </div>
        {user?.role === 'VIEWER' && user.tresorerieEntitesAccess.length === 0 && (
          <p className="text-xs text-amber-600">Aucune entité de trésorerie ne vous est attribuée. Contactez un administrateur.</p>
        )}
      </div>

      {entiteId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Détail par banque</span>
            <span className="text-xs text-gray-400">{isFetching ? 'Chargement…' : `${rowList.length} banque(s)`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50/60 border-b text-xs text-gray-500">
                  <th className="sticky left-0 bg-gray-50/60 text-left px-3 py-2 font-semibold min-w-40">Banque</th>
                  <th className="px-2 py-2 text-center font-semibold">Devise</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-28">J-1</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-28">Entrées</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-28">Sorties</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-28">J</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-28">Position Banque</th>
                  <th className="px-2 py-2 text-right font-semibold min-w-24">Écart</th>
                  <th className="px-2 py-2 text-left font-semibold min-w-40">Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {rowList.map(r => {
                  const ecart = r.positionJ - r.positionBanque;
                  const detailed = r.mouvements.length > 0;
                  const isOpen = !!expanded[r.banqueId];
                  return (
                    <Fragment key={r.banqueId}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50/30">
                      <td className="sticky left-0 bg-white px-3 py-1.5 text-xs text-gray-700 min-w-40">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExpanded(prev => ({ ...prev, [r.banqueId]: !prev[r.banqueId] }))}
                            className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                            title="Détail entrées / sorties"
                          >
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            {r.nomBanque}
                            <div className="text-[10px] text-gray-400">{r.typeCompte}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1 text-center font-mono text-gray-500">{r.devise}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number" step="0.01"
                          value={r.positionJMoins1}
                          onChange={e => updateRow(r.banqueId, { positionJMoins1: parseFloat(e.target.value) || 0 })}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-2 py-1">
                        {detailed ? (
                          <div className="text-right font-mono text-gray-700 px-1.5 py-1" title="Somme des lignes détaillées">
                            {formatNumber(r.entrees)} <span className="text-[9px] text-teal-600">(détaillé)</span>
                          </div>
                        ) : (
                          <input
                            type="number" step="0.01"
                            value={r.entrees || ''}
                            placeholder="0"
                            onChange={e => updateRow(r.banqueId, { entrees: parseFloat(e.target.value) || 0 })}
                            className={inputCls}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {detailed ? (
                          <div className="text-right font-mono text-gray-700 px-1.5 py-1" title="Somme des lignes détaillées">
                            {formatNumber(r.sorties)} <span className="text-[9px] text-teal-600">(détaillé)</span>
                          </div>
                        ) : (
                          <input
                            type="number" step="0.01"
                            value={r.sorties || ''}
                            placeholder="0"
                            onChange={e => updateRow(r.banqueId, { sorties: parseFloat(e.target.value) || 0 })}
                            className={inputCls}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-gray-700">
                        {formatNumber(r.positionJ)}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number" step="0.01"
                          value={r.positionBanque}
                          onChange={e => updateRow(r.banqueId, { positionBanque: parseFloat(e.target.value) || 0 })}
                          className={inputCls}
                        />
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono font-semibold ${ecart !== 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {formatNumber(ecart)}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="text"
                          value={r.commentaire}
                          onChange={e => updateRow(r.banqueId, { commentaire: e.target.value })}
                          className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white"
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <td colSpan={9} className="px-3 py-3">
                          <div className="pl-6 space-y-2">
                            {r.mouvements.length === 0 && (
                              <p className="text-[11px] text-gray-400">Aucune ligne de détail — le total Entrées/Sorties reste modifiable directement ci-dessus.</p>
                            )}
                            {r.mouvements.map((m, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.type === 'ENTREE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {m.type === 'ENTREE' ? 'Entrée' : 'Sortie'}
                                </span>
                                <input
                                  type="text"
                                  value={m.libelle}
                                  onChange={e => updateMouvement(r.banqueId, idx, { libelle: e.target.value })}
                                  placeholder="Libellé…"
                                  className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none bg-white"
                                />
                                <input
                                  type="number" step="0.01"
                                  value={m.montant || ''}
                                  placeholder="0"
                                  onChange={e => updateMouvement(r.banqueId, idx, { montant: parseFloat(e.target.value) || 0 })}
                                  className={inputCls + ' max-w-[140px]'}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeMouvement(r.banqueId, idx)}
                                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                type="button"
                                onClick={() => addMouvement(r.banqueId, 'ENTREE')}
                                className="flex items-center gap-1 text-[11px] text-green-700 hover:text-green-800 font-semibold"
                              >
                                <Plus className="w-3 h-3" /> Ajouter une entrée
                              </button>
                              <button
                                type="button"
                                onClick={() => addMouvement(r.banqueId, 'SORTIE')}
                                className="flex items-center gap-1 text-[11px] text-red-700 hover:text-red-800 font-semibold"
                              >
                                <Plus className="w-3 h-3" /> Ajouter une sortie
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50/50 border-t-2 border-blue-200 font-semibold">
                  <td className="px-3 py-2 text-xs text-blue-900" colSpan={2}>Total (équiv. XOF)</td>
                  <td colSpan={3} />
                  <td className="px-2 py-2 text-right font-mono text-blue-900 text-xs">{formatNumber(totals.positionJXof)}</td>
                  <td />
                  <td className="px-2 py-2 text-right font-mono text-xs" style={{ color: Math.abs(totals.ecartXof) > 0.5 ? '#d97706' : '#9ca3af' }}>
                    {formatNumber(totals.ecartXof)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="p-4 flex items-center gap-3 border-t border-gray-100">
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex items-center gap-2 bg-[#1B3A6B] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1B3A6B]/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Données enregistrées
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
