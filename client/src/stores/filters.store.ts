import { create } from 'zustand';
import type { GlobalFilters } from '../types';

interface FiltersState extends GlobalFilters {
  setBu: (bu: string) => void;
  setAnnee: (annee: number) => void;
  setMois: (mois: number) => void;
  setMoisMin: (moisMin: number) => void;
  setEntiteId: (id?: number) => void;
  setMode: (mode: 'YTD' | 'MTD') => void;
}

const now = new Date();

export const useFiltersStore = create<FiltersState>((set) => ({
  bu: 'PROCUREMENT',
  annee: now.getFullYear(),
  mois: now.getMonth() + 1,
  moisMin: 1,
  entiteId: undefined,
  mode: 'YTD',
  setBu: (bu) => set({ bu, entiteId: undefined, moisMin: 1 }),
  setAnnee: (annee) => set({ annee, moisMin: 1 }),
  setMois: (mois) => set({ mois }),
  setMoisMin: (moisMin) => set({ moisMin }),
  setEntiteId: (entiteId) => set({ entiteId }),
  setMode: (mode) => set({ mode }),
}));
