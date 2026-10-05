import api from '../lib/api';
import type { DimBu, DimEntite, DimClient, DimLignePl } from '../types';

export const referentielService = {
  getBu: () => api.get<DimBu[]>('/referentiels/bu').then(r => r.data),
  getEntites: (bu?: string) => api.get<DimEntite[]>('/referentiels/entites', { params: { bu } }).then(r => r.data),
  getClients: (entiteId?: number) => api.get<DimClient[]>('/referentiels/clients', { params: { entiteId } }).then(r => r.data),
  getLignesPl: () => api.get<DimLignePl[]>('/referentiels/lignes-pl').then(r => r.data),
  getAnneesDisponibles: (bu?: string) => api.get<number[]>('/referentiels/annees-disponibles', { params: bu ? { bu } : {} }).then(r => r.data),
  createEntite: (data: object) => api.post('/referentiels/entites', data).then(r => r.data),
  updateEntite: (id: number, data: object) => api.put(`/referentiels/entites/${id}`, data).then(r => r.data),
  deleteEntite: (id: number) => api.delete(`/referentiels/entites/${id}`).then(r => r.data),

  getClientGroupes: (entiteId: number) =>
    api.get<{ entiteId: number; clients: Array<{ clientNom: string; groupe: string; id: number | null }> }>(
      '/referentiels/client-groupes', { params: { entiteId } },
    ).then(r => r.data),
  putClientGroupe: (data: { entiteId: number; clientNom: string; groupe: string; ordre?: number }) =>
    api.put('/referentiels/client-groupes', data).then(r => r.data),
  deleteClientGroupe: (id: number) => api.delete(`/referentiels/client-groupes/${id}`).then(r => r.data),
};
