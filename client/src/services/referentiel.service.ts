import api from '../lib/api';
import type { DimBu, DimEntite, DimClient, DimLignePl } from '../types';

export const referentielService = {
  getBu: () => api.get<DimBu[]>('/referentiels/bu').then(r => r.data),
  getEntites: (bu?: string) => api.get<DimEntite[]>('/referentiels/entites', { params: { bu } }).then(r => r.data),
  getClients: (entiteId?: number) => api.get<DimClient[]>('/referentiels/clients', { params: { entiteId } }).then(r => r.data),
  getLignesPl: () => api.get<DimLignePl[]>('/referentiels/lignes-pl').then(r => r.data),
  createEntite: (data: object) => api.post('/referentiels/entites', data).then(r => r.data),
  updateEntite: (id: number, data: object) => api.put(`/referentiels/entites/${id}`, data).then(r => r.data),
  deleteEntite: (id: number) => api.delete(`/referentiels/entites/${id}`).then(r => r.data),
};
