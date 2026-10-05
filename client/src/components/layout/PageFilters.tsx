import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFiltersStore } from '../../stores/filters.store';
import { useAuthStore } from '../../stores/auth.store';
import { referentielService } from '../../services/referentiel.service';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Fwd' },
  { value: 'LOGISTICS',          label: 'Logistics' },
];

interface Props {
  showEntity?: boolean;
  showBu?: boolean;
}

export default function PageFilters({ showEntity = false, showBu = true }: Props) {
  const { bu, annee, mois, moisMin, entiteId, anneesDisponibles, setBu, setAnnee, setMois, setMoisMin, setEntiteId } = useFiltersStore();
  const { user } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';
  const visibleBus = isViewer && user?.buAccess?.length ? BU_OPTIONS.filter(b => user.buAccess.includes(b.value)) : BU_OPTIONS;
  const years = (anneesDisponibles.length > 0 ? anneesDisponibles : [annee]).slice().sort((a, b) => a - b);

  const { data: entites = [] } = useQuery({
    queryKey: ['entites', bu],
    queryFn: () => referentielService.getEntites(bu),
    enabled: showEntity,
  });

  useEffect(() => {
    // VIEWER mono-entité : on verrouille sur son entité. Multi-entités : on le laisse choisir (« All my entities » possible).
    if (showEntity && isViewer && entites.length === 1 && entiteId !== entites[0].id) {
      setEntiteId(entites[0].id);
    }
  }, [showEntity, isViewer, entites, entiteId, setEntiteId]);

  const nMonths = mois - moisMin + 1;
  const isYtd   = moisMin === 1;
  const isSingle = moisMin === mois;

  const periodLabel = isYtd
    ? `YTD ${MONTHS[mois - 1]} ${annee}`
    : isSingle
    ? `${MONTHS[mois - 1]} ${annee}`
    : `${MONTHS[moisMin - 1]} – ${MONTHS[mois - 1]} ${annee} · ${nMonths}m`;

  return (
    <div className="flex items-center gap-3 flex-wrap py-2.5 border-b border-gray-200 mb-4">

      {/* Year — segmented control */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setAnnee(y)}
            className={`px-3 py-1.5 text-xs font-bold border-r border-gray-200 last:border-r-0 transition-colors ${
              annee === y
                ? 'bg-[#1B3A6B] text-white'
                : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* BU — segmented control */}
      {showBu && (
        <>
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
          {isViewer && visibleBus.length <= 1 ? (
            <span className="text-xs font-semibold text-[#1B3A6B] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg flex-shrink-0">
              {BU_OPTIONS.find(b => b.value === bu)?.label ?? bu}
            </span>
          ) : (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
              {visibleBus.map(b => (
                <button
                  key={b.value}
                  onClick={() => setBu(b.value)}
                  className={`px-3 py-1.5 text-xs font-bold border-r border-gray-200 last:border-r-0 transition-colors ${
                    bu === b.value
                      ? 'bg-[#1B3A6B] text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

      {/* From selector */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">From</span>
        <select
          value={moisMin}
          onChange={e => {
            const val = parseInt(e.target.value);
            setMoisMin(val);
            if (val > mois) setMois(val);
          }}
          className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3B4] focus:border-[#00A3B4] transition-colors"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

      {/* Month chips — end month selector; chips in range are highlighted */}
      <div className="flex gap-1 flex-shrink-0">
        {MONTHS.map((m, i) => {
          const monthNum = i + 1;
          const isEnd    = monthNum === mois;
          const isStart  = monthNum === moisMin && moisMin < mois;
          const inRange  = monthNum > moisMin && monthNum < mois;
          return (
            <button
              key={monthNum}
              onClick={() => {
                setMois(monthNum);
                if (monthNum < moisMin) setMoisMin(monthNum);
              }}
              title={isEnd ? 'To (end month)' : isStart ? 'From (start month)' : inRange ? 'In range' : `Select ${m}`}
              className={`w-9 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                isEnd
                  ? 'bg-[#00A3B4] text-white shadow-sm'
                  : isStart
                  ? 'bg-[#00A3B4]/30 text-[#007A87] border border-[#00A3B4]/50'
                  : inRange
                  ? 'bg-[#00A3B4]/15 text-[#007A87]'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Entity — shown only on relevant pages */}
      {showEntity && entites.length > 0 && (
        <>
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
          {isViewer && entites.length <= 1 ? (
            <span className="text-xs font-semibold text-[#1B3A6B] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              {entites.find(e => e.id === entiteId)?.nomCourt ?? entites[0]?.nomCourt ?? '—'}
            </span>
          ) : (
            <select
              value={entiteId ?? ''}
              onChange={e => setEntiteId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#00A3B4] focus:border-transparent transition-colors"
            >
              <option value="">{isViewer ? 'All my entities' : 'All entities'}</option>
              {entites.map(e => (
                <option key={e.id} value={e.id}>{e.nomCourt}</option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Period badge — right-aligned */}
      <span className="ml-auto text-xs font-medium flex-shrink-0">
        <span className={`font-bold ${isYtd ? 'text-gray-700' : 'text-[#00A3B4]'}`}>{periodLabel}</span>
      </span>
    </div>
  );
}
