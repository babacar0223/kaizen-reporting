import api from '../lib/api';
import type {
  TresorerieEntite,
  TresorerieBanque,
  TresorerieDevise,
  TresorerieSaisieJourResponse,
  TresorerieDashboardResponse,
  TresorerieHistoriquePoint,
} from '../types';

export const tresorerieService = {
  getEntites: () =>
    api.get<TresorerieEntite[]>('/referentiels/tresorerie/entites').then(r => r.data),
  createEntite: (data: object) =>
    api.post<TresorerieEntite>('/referentiels/tresorerie/entites', data).then(r => r.data),
  updateEntite: (id: number, data: object) =>
    api.put<TresorerieEntite>(`/referentiels/tresorerie/entites/${id}`, data).then(r => r.data),

  getBanques: (entiteId?: number) =>
    api.get<TresorerieBanque[]>('/referentiels/tresorerie/banques', { params: entiteId ? { entiteId } : {} }).then(r => r.data),
  createBanque: (data: object) =>
    api.post<TresorerieBanque>('/referentiels/tresorerie/banques', data).then(r => r.data),
  updateBanque: (id: number, data: object) =>
    api.put<TresorerieBanque>(`/referentiels/tresorerie/banques/${id}`, data).then(r => r.data),

  getDevises: () =>
    api.get<TresorerieDevise[]>('/referentiels/tresorerie/devises').then(r => r.data),
  upsertDevise: (data: object) =>
    api.post<TresorerieDevise>('/referentiels/tresorerie/devises', data).then(r => r.data),

  getSaisieJour: (date: string, entiteId: number) =>
    api.get<TresorerieSaisieJourResponse>(`/tresorerie/saisie/${date}`, { params: { entiteId } }).then(r => r.data),
  batchUpsertSaisie: (date: string, entiteId: number, rows: object[]) =>
    api.post('/tresorerie/saisie', { date, entiteId, rows }).then(r => r.data),

  getDashboard: (date: string) =>
    api.get<TresorerieDashboardResponse>(`/tresorerie/dashboard/${date}`).then(r => r.data),

  getHistorique: (banqueId: number, from?: string, to?: string) =>
    api.get<TresorerieHistoriquePoint[]>(`/tresorerie/historique/${banqueId}`, { params: { from, to } }).then(r => r.data),
};
