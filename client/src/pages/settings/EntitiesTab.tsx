import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { useAuthStore } from '../../stores/auth.store';
import type { DimEntite, DimBu } from '../../types';
import { Edit2, Check, X, Plus, Trash2, AlertTriangle } from 'lucide-react';

const CURRENCIES = ['EUR', 'CFA', 'USD', 'GBP', 'MAD', 'XOF'];

const BU_BADGE: Record<string, string> = {
  PROC: 'bg-blue-100 text-blue-700',
  FF:   'bg-purple-100 text-purple-700',
  LOG:  'bg-emerald-100 text-emerald-700',
};

interface EditRow {
  nom: string;
  nomCourt: string;
  buId: string;
  deviseSource: string;
  tauxConversion: string;
  ratioBu: string;
  actif: boolean;
}

function emptyRow(bus: DimBu[]): EditRow {
  return { nom: '', nomCourt: '', buId: String(bus[0]?.id ?? ''), deviseSource: 'EUR', tauxConversion: '1', ratioBu: '', actif: true };
}

function toEditRow(e: DimEntite): EditRow {
  return {
    nom: e.nom,
    nomCourt: e.nomCourt,
    buId: String(e.buId),
    deviseSource: e.deviseSource,
    tauxConversion: String(e.tauxConversion),
    ratioBu: e.ratioBu != null ? String(e.ratioBu) : '',
    actif: e.actif,
  };
}

function toPayload(row: EditRow) {
  return {
    nom: row.nom,
    nomCourt: row.nomCourt,
    buId: parseInt(row.buId),
    deviseSource: row.deviseSource,
    tauxConversion: parseFloat(row.tauxConversion) || 1,
    ratioBu: row.ratioBu !== '' ? parseFloat(row.ratioBu) : null,
    actif: row.actif,
  };
}

function RowFields({ row, bus, onChange }: { row: EditRow; bus: DimBu[]; onChange: (patch: Partial<EditRow>) => void }) {
  const input = 'border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none';
  return (
    <>
      <td className="px-3 py-2">
        <input value={row.nomCourt} onChange={e => onChange({ nomCourt: e.target.value })} placeholder="Short name" className={input + ' w-24'} />
      </td>
      <td className="px-3 py-2">
        <input value={row.nom} onChange={e => onChange({ nom: e.target.value })} placeholder="Full name" className={input + ' w-48'} />
      </td>
      <td className="px-3 py-2">
        <select value={row.buId} onChange={e => onChange({ buId: e.target.value })} className={input + ' w-28'}>
          {bus.map(b => <option key={b.id} value={b.id}>{b.nomCourt} — {b.nom}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={row.deviseSource} onChange={e => onChange({ deviseSource: e.target.value })} className={input + ' w-20'}>
          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input type="number" value={row.tauxConversion} onChange={e => onChange({ tauxConversion: e.target.value })} placeholder="1" className={input + ' w-24 text-right'} />
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.0001" value={row.ratioBu} onChange={e => onChange({ ratioBu: e.target.value })} placeholder="—" title="BU contribution ratio (e.g. 0.049 for 4.9%)" className={input + ' w-20 text-right'} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={row.actif} onChange={e => onChange({ actif: e.target.checked })} className="accent-[#1B3A6B]" />
      </td>
    </>
  );
}

function NewEntityRow({ bus, onSave, onCancel }: { bus: DimBu[]; onSave: (row: EditRow) => void; onCancel: () => void }) {
  const [row, setRow] = useState<EditRow>(() => emptyRow(bus));
  const patch = (p: Partial<EditRow>) => setRow(r => ({ ...r, ...p }));
  return (
    <tr className="border-b border-blue-100 bg-blue-50/40">
      <RowFields row={row} bus={bus} onChange={patch} />
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onSave(row)} disabled={!row.nom || !row.nomCourt} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40" title="Save"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={onCancel} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Cancel"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}

export default function EntitiesTab() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<EditRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: entites = [] } = useQuery({ queryKey: ['entites-all'], queryFn: () => referentielService.getEntites() });
  const { data: bus = [] } = useQuery({ queryKey: ['bus-all'], queryFn: referentielService.getBu });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => referentielService.updateEntite(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entites-all'] }); setEditId(null); setEditRow(null); },
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => referentielService.createEntite(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entites-all'] }); setAdding(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => referentielService.deleteEntite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entites-all'] });
      qc.invalidateQueries({ queryKey: ['entites'] });
      setConfirmDeleteId(null);
    },
  });

  const startEdit = (e: DimEntite) => { setEditId(e.id); setEditRow(toEditRow(e)); };
  const cancelEdit = () => { setEditId(null); setEditRow(null); };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-800">Entities</h2>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{entites.length}</span>
          </div>
          <button
            onClick={() => { setAdding(true); setEditId(null); }}
            className="flex items-center gap-1.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Entity
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="text-left px-3 py-2.5 font-semibold">Short Name</th>
                <th className="text-left px-3 py-2.5 font-semibold">Full Name</th>
                <th className="text-left px-3 py-2.5 font-semibold">BU</th>
                <th className="text-left px-3 py-2.5 font-semibold">Currency</th>
                <th className="text-right px-3 py-2.5 font-semibold">Conv. Rate</th>
                <th className="text-right px-3 py-2.5 font-semibold" title="Contribution ratio to BU total (e.g. 0.049 = 4.9%)">Ratio BU</th>
                <th className="text-center px-3 py-2.5 font-semibold">Active</th>
                <th className="px-3 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <NewEntityRow
                  bus={bus}
                  onSave={row => createMutation.mutate(toPayload(row))}
                  onCancel={() => setAdding(false)}
                />
              )}
              {entites.map(e => (
                <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  {editId === e.id && editRow ? (
                    <>
                      <RowFields row={editRow} bus={bus} onChange={p => setEditRow(r => r ? { ...r, ...p } : r)} />
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateMutation.mutate({ id: e.id, data: toPayload(editRow) })} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Save"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={cancelEdit} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 font-semibold text-gray-800">{e.nomCourt}</td>
                      <td className="px-3 py-2.5 text-gray-600">{e.nom}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${BU_BADGE[e.bu?.nomCourt ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>{e.bu?.nomCourt}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{e.deviseSource}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-600">{Number(e.tauxConversion).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-400">
                        {e.ratioBu != null ? `${(Number(e.ratioBu) * 100).toFixed(1)}%` : <span className="text-gray-200">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {e.actif ? <span className="text-green-500 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => startEdit(e)} className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {isSuperAdmin && (
                            confirmDeleteId === e.id ? (
                              <div className="flex items-center gap-0.5 ml-1">
                                <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                                <button
                                  onClick={() => deleteMutation.mutate(e.id)}
                                  disabled={deleteMutation.isPending}
                                  className="px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded disabled:opacity-50"
                                >
                                  {deleteMutation.isPending ? '…' : 'Confirm'}
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setConfirmDeleteId(e.id); setEditId(null); }}
                                className="p-1 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Delete entity and all its data"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
