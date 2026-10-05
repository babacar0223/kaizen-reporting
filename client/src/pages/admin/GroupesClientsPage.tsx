import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referentielService } from '../../services/referentiel.service';
import { Check, Info } from 'lucide-react';

const input = 'border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-[#00A3B4] focus:outline-none';

export default function GroupesClientsPage() {
  const qc = useQueryClient();
  const { data: entites = [] } = useQuery({ queryKey: ['entites'], queryFn: () => referentielService.getEntites() });
  const [entiteId, setEntiteId] = useState<number | null>(null);

  useEffect(() => {
    if (entiteId === null && entites.length > 0) setEntiteId(entites[0].id);
  }, [entites, entiteId]);

  const { data, isLoading } = useQuery({
    queryKey: ['client-groupes', entiteId],
    queryFn: () => referentielService.getClientGroupes(entiteId!),
    enabled: entiteId !== null,
  });

  const rows = data?.clients ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => { setDrafts({}); }, [entiteId]);

  const knownGroupes = useMemo(
    () => [...new Set(rows.map(r => r.groupe).filter(Boolean))].sort(),
    [rows],
  );

  const mutation = useMutation({
    mutationFn: (payload: { entiteId: number; clientNom: string; groupe: string }) =>
      referentielService.putClientGroupe(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-groupes', entiteId] }),
  });

  const save = (clientNom: string) => {
    if (entiteId === null) return;
    const draft = drafts[clientNom];
    if (draft === undefined) return;
    mutation.mutate({ entiteId, clientNom, groupe: draft.trim() });
    setDrafts(prev => { const n = { ...prev }; delete n[clientNom]; return n; });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Map each client to a <strong>consolidation group</strong> (e.g. Barrick, Tongon).
          Several clients can share the same group (e.g. SOMILO SA + GOUNKOTO SA → Barrick).
          A client with no group is consolidated under <strong>“Others”</strong> in the Clients module.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-gray-800 text-sm">Client Groups</h2>
          <select
            value={entiteId ?? ''}
            onChange={e => setEntiteId(parseInt(e.target.value) || null)}
            className={input}
          >
            {entites.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </div>

        <datalist id="known-groups">
          {knownGroupes.map(g => <option key={g} value={g} />)}
        </datalist>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="text-left px-4 py-2 font-semibold">Client</th>
                <th className="text-left px-4 py-2 font-semibold">Group</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={3} className="text-center text-gray-400 py-8">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={3} className="text-center text-gray-400 py-8">
                  No client imported for this entity.
                </td></tr>
              )}
              {rows.map(r => {
                const draft = drafts[r.clientNom];
                const value = draft ?? r.groupe;
                const dirty = draft !== undefined && draft.trim() !== r.groupe;
                return (
                  <tr key={r.clientNom} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium text-gray-800">{r.clientNom}</td>
                    <td className="px-4 py-2">
                      <input
                        list="known-groups"
                        value={value}
                        placeholder="Others"
                        onChange={e => setDrafts(prev => ({ ...prev, [r.clientNom]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') save(r.clientNom); }}
                        onBlur={() => save(r.clientNom)}
                        className={input + ' w-48'}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {dirty && (
                        <button
                          onClick={() => save(r.clientNom)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
