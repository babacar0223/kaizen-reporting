import api from '../lib/api';
import type { SalesResponse } from '../types';

export const salesService = {
  getSales: (bu: string, entiteId: number, annee: number, mois: number) =>
    api.get<SalesResponse>(`/sales/${bu}/${entiteId}/${annee}/${mois}`).then(r => r.data),

  upsertSales: (rows: object[]) =>
    api.post('/admin/sales', { rows }).then(r => r.data),
};
