import { Layers } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

export const BU_OPTIONS = [
  { value: 'PROCUREMENT',        label: 'Procurement', color: '#1B5E8B' },
  { value: 'FREIGHT_FORWARDING', label: 'Freight Fwd', color: '#6B35B5' },
  { value: 'LOGISTICS',          label: 'Logistics',   color: '#15857A' },
];

export type Scope = 'GROUP' | 'PROCUREMENT' | 'FREIGHT_FORWARDING' | 'LOGISTICS';

interface Props {
  value: Scope;
  onChange: (scope: Scope) => void;
}

// Sélecteur de périmètre Groupe / BU — état local à la page qui l'utilise (jamais dans le store
// global), pour éviter que le choix d'une page ne pollue les autres.
export default function ScopeSelector({ value, onChange }: Props) {
  const { user } = useAuthStore();
  const isViewer = user?.role === 'VIEWER';
  const visibleBus = isViewer && user?.buAccess?.length ? BU_OPTIONS.filter(b => user.buAccess.includes(b.value)) : BU_OPTIONS;

  return (
    <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
      {!isViewer && (
        <button
          onClick={() => onChange('GROUP')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            value === 'GROUP'
              ? 'bg-gradient-to-r from-[#1B3A6B] to-[#1B5E8B] text-white shadow-md ring-2 ring-[#1B3A6B]/30'
              : 'bg-white text-[#1B3A6B] border border-[#1B3A6B]/30 hover:bg-[#1B3A6B]/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Group
        </button>
      )}
      {visibleBus.map(b => {
        const active = value === b.value;
        return (
          <button
            key={b.value}
            onClick={() => onChange(b.value as Scope)}
            style={active
              ? { backgroundColor: b.color, boxShadow: `0 1px 6px ${b.color}55` }
              : { color: b.color, borderColor: `${b.color}44` }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border ${
              active ? 'text-white border-transparent' : 'bg-white hover:opacity-80'
            }`}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
