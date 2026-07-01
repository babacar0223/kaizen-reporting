import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';
import { referentielService } from '../../services/referentiel.service';

const YEARS = [2024, 2025, 2026];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function FilterBar() {
  const { bu, annee, mois, entiteId, mode, setAnnee, setMois, setEntiteId, setMode } = useFiltersStore();
  const { user } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', bu],
    queryFn: () => referentielService.getEntites(bu),
  });

  // Auto-select the entity for VIEWER role as soon as their entity list loads
  useEffect(() => {
    if (isViewer && entites.length > 0 && !entiteId) {
      setEntiteId(entites[0].id);
    }
  }, [isViewer, entites, entiteId, setEntiteId]);

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-4 text-sm">
      {/* Year */}
      <div className="flex items-center gap-2">
        <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Year</label>
        <select
          value={annee}
          onChange={e => setAnnee(parseInt(e.target.value))}
          className="border border-gray-200 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3B4]"
        >
          {YEARS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Month */}
      <div className="flex items-center gap-2">
        <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Month</label>
        <select
          value={mois}
          onChange={e => setMois(parseInt(e.target.value))}
          className="border border-gray-200 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3B4]"
        >
          {MONTHS_EN.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
      </div>

      {/* Entity */}
      <div className="flex items-center gap-2">
        <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">Entity</label>
        {isViewer ? (
          /* VIEWER: display as read-only badge — they cannot change entity */
          <span className="border border-gray-200 rounded px-2 py-1 text-sm bg-gray-50 text-gray-700 font-medium">
            {entites.find(e => e.id === entiteId)?.nomCourt ?? '—'}
          </span>
        ) : (
          <select
            value={entiteId ?? ''}
            onChange={e => setEntiteId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="border border-gray-200 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3B4]"
          >
            <option value="">All</option>
            {entites.map(e => <option key={e.id} value={e.id}>{e.nomCourt}</option>)}
          </select>
        )}
      </div>

      {/* Mode YTD/MTD */}
      <div className="flex items-center gap-1 ml-2 bg-gray-100 rounded-lg p-0.5">
        {(['YTD', 'MTD'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${mode === m ? 'bg-white shadow text-[#1B3A6B]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Active period */}
      <div className="ml-auto text-xs text-gray-400 font-medium">
        Period: <span className="text-gray-700">{MONTHS_EN[mois - 1]} {annee}</span>
      </div>
    </div>
  );
}
