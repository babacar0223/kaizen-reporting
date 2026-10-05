import { create } from 'zustand';
import type { GlobalFilters } from '../types';

interface FiltersState extends GlobalFilters {
  anneesDisponibles: number[];
  setBu: (bu: string) => void;
  setAnnee: (annee: number) => void;
  setMois: (mois: number) => void;
  setMoisMin: (moisMin: number) => void;
  setEntiteId: (id?: number) => void;
  setMode: (mode: 'YTD' | 'MTD') => void;
  setAnneesDisponibles: (annees: number[]) => void;
}

const now = new Date();

export const useFiltersStore = create<FiltersState>((set, get) => ({
  bu: 'PROCUREMENT',
  annee: now.getFullYear(),
  mois: now.getMonth() + 1,
  moisMin: 1,
  entiteId: undefined,
  mode: 'YTD',
  anneesDisponibles: [],
  setBu: (bu) => set({ bu, entiteId: undefined, moisMin: 1 }),
  setAnnee: (annee) => set({ annee, moisMin: 1 }),
  setMois: (mois) => set({ mois }),
  setMoisMin: (moisMin) => set({ moisMin }),
  setEntiteId: (entiteId) => set({ entiteId }),
  setMode: (mode) => set({ mode }),
  // Appelé une fois au chargement avec les années réellement importées : si l'année
  // courante (par défaut l'année calendaire) n'a pas de données, bascule sur la plus récente qui en a.
  setAnneesDisponibles: (annees) => {
    set({ anneesDisponibles: annees });
    const { annee } = get();
    if (annees.length > 0 && !annees.includes(annee)) {
      set({ annee: Math.max(...annees), moisMin: 1 });
    }
  },
}));
