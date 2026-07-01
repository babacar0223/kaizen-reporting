export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
export type BuType = 'PROCUREMENT' | 'FREIGHT_FORWARDING' | 'LOGISTICS';
export type TypeValeur = 'ACTUALS' | 'TARGET' | 'YTD_N1';
export type TypePeriode = 'MTD' | 'YTD' | 'ANNUAL_BUDGET';

export interface User {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  buAccess: string[];
  entitesAccess: number[];
  actif: boolean;
  lastLoginAt?: string;
}

export interface DimBu {
  id: number;
  nom: string;
  nomCourt: string;
  couleurUi: string;
  entites?: DimEntite[];
}

export interface DimEntite {
  id: number;
  nom: string;
  nomCourt: string;
  buId: number;
  bu?: DimBu;
  deviseSource: string;
  tauxConversion: number;
  ratioBu?: number;
  actif: boolean;
}

export interface DimClient {
  id: number;
  nom: string;
  entiteId: number;
  bu: string;
  type: string;
  sousClients?: DimSousClient[];
}

export interface DimSousClient {
  id: number;
  nom: string;
  clientId: number;
  entiteId: number;
}

export interface DimLignePl {
  id: number;
  nom: string;
  ordreAffichage: number;
  type: string;
}

export interface FaitPl {
  id: number;
  date: string;
  annee: number;
  mois: number;
  entiteId: number;
  entite?: DimEntite;
  bu: string;
  lignePlId: number;
  lignePl?: DimLignePl;
  typeValeur: TypeValeur;
  typePeriode: TypePeriode;
  montant: number;
  sourceOnglet?: string;
}

export interface FaitRevenusClients {
  id: number;
  date: string;
  annee: number;
  mois: number;
  entiteId: number;
  entite?: DimEntite;
  bu: string;
  clientNom: string;
  sousClientNom?: string;
  lignePl: string;
  typeValeur: TypeValeur;
  montant: number;
  marginRate?: number;
  sharePct?: number;
}

export interface PlBuResponse {
  bu: string;
  annee: number;
  mois: number;
  data: Array<{ entite: string; lignePl: string; typeValeur: string; montant: number }>;
}

export interface KpiBuResponse {
  bu: string;
  annee: number;
  mois: number;
  kpis: Record<string, Record<string, number>>;
}

export interface SalesResponse {
  bu: string;
  entiteId: number;
  annee: number;
  mois: number;
  data: FaitRevenusClients[];
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
  detectedMonths?: number[];
  referenceMois?: number;
  entiteId?: number;
  bu?: string;
  entiteNom?: string;
  annee?: number;
}

export interface PreviewLine {
  nom: string;
  budget: number;
  months: Record<number, number>;
  ytdN1: number;
}

export interface ClientPreviewRow {
  clientNom: string;
  type: 'REVENUE' | 'MARGIN';
  mtd: number;
  ytd: number;
  budget: number;
  marginRate: number | null;
  share: number | null;
}

export interface PreviewResult {
  errors: string[];
  bu?: string;
  entiteNom?: string;
  annee?: number;
  isCfa?: boolean;
  detectedMonths?: number[];
  referenceMois?: number;
  lines: PreviewLine[];
  statsLines: PreviewLine[];
  overheadLines: PreviewLine[];
  clientLines: ClientPreviewRow[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface GlobalFilters {
  bu: string;
  annee: number;
  mois: number;
  moisMin: number;
  entiteId?: number;
  mode: 'YTD' | 'MTD';
}
