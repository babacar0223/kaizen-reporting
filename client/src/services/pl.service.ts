import api from '../lib/api';
import type { PlBuResponse, KpiBuResponse } from '../types';

export const plService = {
  getPlBu: (bu: string, annee: number, mois: number) =>
    api.get<PlBuResponse>(`/pl/${bu}/${annee}/${mois}`).then(r => r.data),

  getPlEntite: (bu: string, entiteId: number, annee: number, mois: number) =>
    api.get(`/pl/${bu}/${entiteId}/${annee}/${mois}`).then(r => r.data),

  getKpiBu: (bu: string, annee: number, mois: number) =>
    api.get<KpiBuResponse>(`/kpi/bu/${bu}/${annee}/${mois}`).then(r => r.data),

  upsertPl: (data: object) => api.post('/admin/pl', data).then(r => r.data),
  batchUpsertPl: (rows: object[]) => api.post('/admin/pl/batch', { rows }).then(r => r.data),

  downloadEntityPl: (bu: string, entiteId: number, annee: number) =>
    api.get(`/admin/export/pl/${bu}/${entiteId}/${annee}`, { responseType: 'blob' }),

  resetEntityPl: (entiteId: number, annee: number) =>
    api.delete(`/admin/pl/entity/${entiteId}/year/${annee}`).then(r => r.data),
};
