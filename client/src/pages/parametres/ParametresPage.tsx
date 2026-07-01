import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { Edit2, Check, X } from 'lucide-react';

export default function ParametresPage() {
  const qc = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});

  const { data: entites = [] } = useQuery({ queryKey: ['entites-all'], queryFn: () => referentielService.getEntites() });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => referentielService.updateEntite(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entites-all'] }); setEditId(null); },
  });

  const startEdit = (e: { id: number; nom: string; nomCourt: string; tauxConversion: number; actif: boolean }) => {
    setEditId(e.id);
    setEditData({ nom: e.nom, nomCourt: e.nomCourt, tauxConversion: String(e.tauxConversion), actif: String(e.actif) });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Paramètres</h1>

      {/* Entités */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Entités</h2>
          <span className="text-xs text-gray-400">{entites.length} entités</span>
        </div>
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-500">
              <th className="text-left px-4 py-2.5 font-semibold">Nom court</th>
              <th className="text-left px-4 py-2.5 font-semibold">Nom complet</th>
              <th className="text-left px-4 py-2.5 font-semibold">BU</th>
              <th className="text-left px-4 py-2.5 font-semibold">Devise</th>
              <th className="text-right px-4 py-2.5 font-semibold">Taux conv.</th>
              <th className="text-center px-4 py-2.5 font-semibold">Actif</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {entites.map(e => (
              <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                {editId === e.id ? (
                  <>
                    <td className="px-4 py-2"><input value={editData.nomCourt} onChange={ev => setEditData(d => ({ ...d, nomCourt: ev.target.value }))} className="border border-gray-200 rounded px-2 py-1 w-24 text-xs" /></td>
                    <td className="px-4 py-2"><input value={editData.nom} onChange={ev => setEditData(d => ({ ...d, nom: ev.target.value }))} className="border border-gray-200 rounded px-2 py-1 w-48 text-xs" /></td>
                    <td className="px-4 py-2 text-gray-500">{e.bu?.nomCourt}</td>
                    <td className="px-4 py-2 text-gray-500">{e.deviseSource}</td>
                    <td className="px-4 py-2"><input type="number" value={editData.tauxConversion} onChange={ev => setEditData(d => ({ ...d, tauxConversion: ev.target.value }))} className="border border-gray-200 rounded px-2 py-1 w-24 text-xs text-right" /></td>
                    <td className="px-4 py-2 text-center"><input type="checkbox" checked={editData.actif === 'true'} onChange={ev => setEditData(d => ({ ...d, actif: String(ev.target.checked) }))} /></td>
                    <td className="px-4 py-2 flex items-center gap-1">
                      <button onClick={() => updateMutation.mutate({ id: e.id, data: { ...editData, tauxConversion: parseFloat(editData.tauxConversion), actif: editData.actif === 'true' } })} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{e.nomCourt}</td>
                    <td className="px-4 py-2.5 text-gray-600">{e.nom}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.bu?.nomCourt}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.deviseSource}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600">{e.tauxConversion}</td>
                    <td className="px-4 py-2.5 text-center">{e.actif ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => startEdit(e)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
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
