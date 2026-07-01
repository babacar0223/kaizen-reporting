import api from '../lib/api';

export interface MonthlyKpi {
  [lignePl: string]: {
    ACTUALS?: number;
    TARGET?: number;
    YTD_N1?: number;
  };
}

export interface StatsResponse {
  bu: string;
  annee: number;
  mois: number;
  monthly: { mois: number; kpis: MonthlyKpi }[];
  ytd: MonthlyKpi;
  entities: { entiteId: number; nom: string; kpis: MonthlyKpi }[];
}

export const statsService = {
  getStats: (bu: string, annee: number, mois: number, entiteId?: number): Promise<StatsResponse> =>
    api.get<StatsResponse>(`/stats/${bu}/${annee}/${mois}`, { params: entiteId ? { entiteId } : {} }).then(r => r.data),
};
