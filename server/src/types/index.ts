export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
export type BuType = 'PROCUREMENT' | 'FREIGHT_FORWARDING' | 'LOGISTICS';
export type TypeValeur = 'ACTUALS' | 'TARGET' | 'YTD_N1';
export type TypePeriode = 'MTD' | 'YTD' | 'ANNUAL_BUDGET';
export type LignePl =
  | 'Revenue'
  | 'Cost of Sales'
  | 'Gross Margin'
  | 'Overheads'
  | 'Salaries and personnel cost'
  | 'Travels, Hotels & Missions'
  | 'Other expenses/revenues'
  | 'Operating Income before M.Fees'
  | 'Management Fees'
  | 'Operating Income'
  | 'EBITDA'
  | 'Net Earnings'
  | 'Cash Flow';

export interface JwtPayload {
  userId: number;
  email: string;
  role: Role;
  buAccess: string[];
  entitesAccess: number[];
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}
