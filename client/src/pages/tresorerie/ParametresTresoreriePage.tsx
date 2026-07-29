import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tresorerieService } from '../../services/tresorerie.service';
import type { TresorerieEntite, TresorerieBanque, TresorerieDevise } from '../../types';
import { Plus, Check, X, Edit2 } from 'lucide-react';

const input = 'border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none';

// ── Devises ───────────────────────────────────────────────────────────────────
function DevisesSection() {
  const qc = useQueryClient();
  const { data: devises = [] } = useQuery({ queryKey: ['tresorerie-devises'], queryFn: tresorerieService.getDevises });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState('');
  const [newLibelle, setNewLibelle] = useState('');
  const [newTaux, setNewTaux] = useState('1');

  const mutation = useMutation({
    mutationFn: (data: object) => tresorerieService.upsertDevise(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tresorerie-devises'] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">Taux de change (base XOF)</h2>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{devises.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500">
              <th className="text-left px-3 py-2 font-semibold">Code</th>
              <th className="text-left px-3 py-2 font-semibold">Libellé</th>
              <th className="text-right px-3 py-2 font-semibold">1 unité = X XOF</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {devises.map((d: TresorerieDevise) => {
              const draft = drafts[d.code];
              return (
                <tr key={d.code} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono font-semibold text-gray-800">{d.code}</td>
                  <td className="px-3 py-2 text-gray-500">{d.libelle}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" step="0.000001"
                      value={draft ?? d.tauxXof}
                      onChange={e => setDrafts(prev => ({ ...prev, [d.code]: e.target.value }))}
                      className={input + ' w-28 text-right font-mono'}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {draft !== undefined && parseFloat(draft) !== Number(d.tauxXof) && (
                      <button
                        onClick={() => {
                          mutation.mutate({ code: d.code, libelle: d.libelle, tauxXof: parseFloat(draft) || 1 });
                          setDrafts(prev => { const n = { ...prev }; delete n[d.code]; return n; });
                        }}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Enregistrer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-blue-50/40">
              <td className="px-3 py-2">
                <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Code (ex: NGN)" className={input + ' w-24'} />
              </td>
              <td className="px-3 py-2">
                <input value={newLibelle} onChange={e => setNewLibelle(e.target.value)} placeholder="Libellé" className={input + ' w-40'} />
              </td>
              <td className="px-3 py-2">
                <input type="number" step="0.000001" value={newTaux} onChange={e => setNewTaux(e.target.value)} className={input + ' w-28 text-right font-mono'} />
              </td>
              <td className="px-3 py-2">
                <button
                  disabled={!newCode}
                  onClick={() => {
                    mutation.mutate({ code: newCode, libelle: newLibelle, tauxXof: parseFloat(newTaux) || 1 });
                    setNewCode(''); setNewLibelle(''); setNewTaux('1');
                  }}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40"
                  title="Ajouter"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Entités ───────────────────────────────────────────────────────────────────
function EntitesSection() {
  const qc = useQueryClient();
  const { data: entites = [] } = useQuery({ queryKey: ['tresorerie-entites'], queryFn: tresorerieService.getEntites });
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState({ nom: '', pays: '', groupe: '', actif: true });
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ nom: '', pays: '', groupe: 'WEST AFRICA' });

  const createMutation = useMutation({
    mutationFn: (data: object) => tresorerieService.createEntite(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tresorerie-entites'] }); setAdding(false); setNewRow({ nom: '', pays: '', groupe: 'WEST AFRICA' }); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => tresorerieService.updateEntite(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tresorerie-entites'] }); setEditId(null); },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800 text-sm">Entités</h2>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500">
              <th className="text-left px-3 py-2 font-semibold">Nom</th>
              <th className="text-left px-3 py-2 font-semibold">Pays</th>
              <th className="text-left px-3 py-2 font-semibold">Groupe</th>
              <th className="text-center px-3 py-2 font-semibold">Actif</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-blue-50/40">
                <td className="px-3 py-2"><input value={newRow.nom} onChange={e => setNewRow(r => ({ ...r, nom: e.target.value }))} className={input + ' w-40'} /></td>
                <td className="px-3 py-2"><input value={newRow.pays} onChange={e => setNewRow(r => ({ ...r, pays: e.target.value }))} className={input + ' w-32'} /></td>
                <td className="px-3 py-2"><input value={newRow.groupe} onChange={e => setNewRow(r => ({ ...r, groupe: e.target.value }))} className={input + ' w-32'} /></td>
                <td />
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => createMutation.mutate(newRow)} disabled={!newRow.nom} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setAdding(false)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            )}
            {entites.map((e: TresorerieEntite) => (
              <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                {editId === e.id ? (
                  <>
                    <td className="px-3 py-2"><input value={editRow.nom} onChange={ev => setEditRow(r => ({ ...r, nom: ev.target.value }))} className={input + ' w-40'} /></td>
                    <td className="px-3 py-2"><input value={editRow.pays} onChange={ev => setEditRow(r => ({ ...r, pays: ev.target.value }))} className={input + ' w-32'} /></td>
                    <td className="px-3 py-2"><input value={editRow.groupe} onChange={ev => setEditRow(r => ({ ...r, groupe: ev.target.value }))} className={input + ' w-32'} /></td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={editRow.actif} onChange={ev => setEditRow(r => ({ ...r, actif: ev.target.checked }))} className="accent-[#1B3A6B]" /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => updateMutation.mutate({ id: e.id, data: editRow })} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-gray-800">{e.nom}</td>
                    <td className="px-3 py-2 text-gray-600">{e.pays}</td>
                    <td className="px-3 py-2 text-gray-500">{e.groupe}</td>
                    <td className="px-3 py-2 text-center">{e.actif ? <span className="text-green-500 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => { setEditId(e.id); setEditRow({ nom: e.nom, pays: e.pays, groupe: e.groupe, actif: e.actif }); }} className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Banques ───────────────────────────────────────────────────────────────────
function BanquesSection() {
  const qc = useQueryClient();
  const { data: entites = [] } = useQuery({ queryKey: ['tresorerie-entites'], queryFn: tresorerieService.getEntites });
  const { data: devises = [] } = useQuery({ queryKey: ['tresorerie-devises'], queryFn: tresorerieService.getDevises });
  const [entiteFilter, setEntiteFilter] = useState<number | null>(null);
  const { data: banques = [] } = useQuery({
    queryKey: ['tresorerie-banques-admin', entiteFilter],
    queryFn: () => tresorerieService.getBanques(entiteFilter ?? undefined),
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState({ nom: '', entiteId: 0, typeCompte: '', devise: 'XOF', actif: true });
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ nom: '', entiteId: 0, typeCompte: 'Compte Courant', devise: 'XOF' });

  const createMutation = useMutation({
    mutationFn: (data: object) => tresorerieService.createBanque(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tresorerie-banques-admin'] }); setAdding(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => tresorerieService.updateBanque(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tresorerie-banques-admin'] }); setEditId(null); },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-800 text-sm">Banques</h2>
        <div className="flex items-center gap-2">
          <select value={entiteFilter ?? ''} onChange={e => setEntiteFilter(parseInt(e.target.value) || null)} className={input}>
            <option value="">Toutes les entités</option>
            {entites.map((e: TresorerieEntite) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
          <button onClick={() => { setAdding(true); setNewRow(r => ({ ...r, entiteId: entiteFilter ?? entites[0]?.id ?? 0 })); }} className="flex items-center gap-1.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500">
              <th className="text-left px-3 py-2 font-semibold">Banque</th>
              <th className="text-left px-3 py-2 font-semibold">Entité</th>
              <th className="text-left px-3 py-2 font-semibold">Type de compte</th>
              <th className="text-center px-3 py-2 font-semibold">Devise</th>
              <th className="text-center px-3 py-2 font-semibold">Actif</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="bg-blue-50/40">
                <td className="px-3 py-2"><input value={newRow.nom} onChange={e => setNewRow(r => ({ ...r, nom: e.target.value }))} className={input + ' w-40'} /></td>
                <td className="px-3 py-2">
                  <select value={newRow.entiteId} onChange={e => setNewRow(r => ({ ...r, entiteId: parseInt(e.target.value) }))} className={input}>
                    {entites.map((e: TresorerieEntite) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2"><input value={newRow.typeCompte} onChange={e => setNewRow(r => ({ ...r, typeCompte: e.target.value }))} className={input + ' w-32'} /></td>
                <td className="px-3 py-2">
                  <select value={newRow.devise} onChange={e => setNewRow(r => ({ ...r, devise: e.target.value }))} className={input}>
                    {devises.map((d: TresorerieDevise) => <option key={d.code} value={d.code}>{d.code}</option>)}
                  </select>
                </td>
                <td />
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => createMutation.mutate(newRow)} disabled={!newRow.nom || !newRow.entiteId} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-40"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setAdding(false)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            )}
            {banques.map((b: TresorerieBanque) => (
              <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                {editId === b.id ? (
                  <>
                    <td className="px-3 py-2"><input value={editRow.nom} onChange={e => setEditRow(r => ({ ...r, nom: e.target.value }))} className={input + ' w-40'} /></td>
                    <td className="px-3 py-2">
                      <select value={editRow.entiteId} onChange={e => setEditRow(r => ({ ...r, entiteId: parseInt(e.target.value) }))} className={input}>
                        {entites.map((e: TresorerieEntite) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input value={editRow.typeCompte} onChange={e => setEditRow(r => ({ ...r, typeCompte: e.target.value }))} className={input + ' w-32'} /></td>
                    <td className="px-3 py-2">
                      <select value={editRow.devise} onChange={e => setEditRow(r => ({ ...r, devise: e.target.value }))} className={input}>
                        {devises.map((d: TresorerieDevise) => <option key={d.code} value={d.code}>{d.code}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={editRow.actif} onChange={e => setEditRow(r => ({ ...r, actif: e.target.checked }))} className="accent-[#1B3A6B]" /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => updateMutation.mutate({ id: b.id, data: editRow })} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-semibold text-gray-800">{b.nom}</td>
                    <td className="px-3 py-2 text-gray-600">{b.entite?.nom}</td>
                    <td className="px-3 py-2 text-gray-500">{b.typeCompte}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-600">{b.devise}</td>
                    <td className="px-3 py-2 text-center">{b.actif ? <span className="text-green-500 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => { setEditId(b.id); setEditRow({ nom: b.nom, entiteId: b.entiteId, typeCompte: b.typeCompte, devise: b.devise, actif: b.actif }); }} className="p-1 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ParametresTresoreriePage() {
  return (
    <div className="space-y-4">
      <DevisesSection />
      <EntitesSection />
      <BanquesSection />
    </div>
  );
}
