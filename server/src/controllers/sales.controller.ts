import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

// GET /api/sales/:bu/:entiteId/:annee/:mois
export async function getSales(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const eId = parseInt(req.params.entiteId as string);
  const user = req.user!;

  if (user.role === 'VIEWER' && user.entitesAccess.length > 0 && !user.entitesAccess.includes(eId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }

  const data = await prisma.faitRevenusClients.findMany({
    where: { bu, entiteId: eId, annee: year, mois: month },
    include: { client: true, sousClient: true },
    orderBy: [{ clientNom: 'asc' }, { sousClientNom: 'asc' }],
  });

  const totalRevActuals = data
    .filter(r => r.lignePl === 'Revenue' && r.typeValeur === 'ACTUALS')
    .reduce((s, r) => s + Number(r.montant), 0);

  const enriched = data.map(r => ({
    ...r,
    sharePct: r.lignePl === 'Revenue' && r.typeValeur === 'ACTUALS' && totalRevActuals > 0
      ? Number(r.montant) / totalRevActuals
      : r.sharePct,
  }));

  res.json({ bu, entiteId: eId, annee: year, mois: month, data: enriched });
}

// POST /api/admin/sales
export async function upsertSales(req: AuthRequest, res: Response): Promise<void> {
  const rows = req.body.rows as Array<{
    entiteId: number;
    bu: string;
    clientNom: string;
    sousClientNom?: string;
    clientId?: number;
    sousClientId?: number;
    lignePl: string;
    typeValeur: string;
    annee: number;
    mois: number;
    montant: number;
    marginRate?: number | null;
    sharePct?: number | null;
    sourceOnglet?: string;
  }>;

  if (!rows || rows.length === 0) { res.json({ created: 0 }); return; }

  const { entiteId, annee, mois, bu } = rows[0];
  const user = req.user!;
  if (user.role === 'VIEWER' && user.entitesAccess.length > 0) {
    const unauthorized = rows.find(r => !user.entitesAccess.includes(r.entiteId));
    if (unauthorized) {
      res.status(403).json({ message: `Accès à l'entité ${unauthorized.entiteId} refusé` });
      return;
    }
  }
  const date = lastDayOfMonth(annee, mois);

  await prisma.faitRevenusClients.deleteMany({ where: { entiteId, annee, mois } });

  const toCreate = rows
    .filter(r => r.montant !== 0)
    .map(r => ({ date, ...r }));

  const result = toCreate.length > 0
    ? await prisma.faitRevenusClients.createMany({ data: toCreate })
    : { count: 0 };

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'UPSERT_SALES',
      tableName: 'fait_revenus_clients',
      entiteId,
      periode: `${annee}-${String(mois).padStart(2, '0')}`,
      details: { bu, count: result.count },
    },
  });

  res.json({ created: result.count });
}

// GET /api/clients/overview/:bu/:annee?mois= — vue portefeuille clients (YTD jusqu'au mois donné, défaut décembre)
export async function getClientsOverview(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = req.query.mois ? parseInt(req.query.mois as string) : 12;
  const user = req.user!;
  const isRestricted = user.role === 'VIEWER';

  const entiteWhere = isRestricted && user.entitesAccess.length > 0
    ? { entiteId: { in: user.entitesAccess } }
    : {};

  // Budget = valeur annuelle (typeValeur TARGET), stockée sur un mois de référence.
  // On la récupère sur toute l'année, indépendamment du filtre `mois <= month`.
  const [rows, targetRows] = await Promise.all([
    prisma.faitRevenusClients.findMany({
      where: { bu, annee: year, mois: { lte: month }, typeValeur: 'ACTUALS', ...entiteWhere },
      include: { entite: true },
      orderBy: [{ entite: { nomCourt: 'asc' } }, { clientNom: 'asc' }],
    }),
    prisma.faitRevenusClients.findMany({
      where: { bu, annee: year, typeValeur: 'TARGET', ...entiteWhere },
      select: { entiteId: true, clientNom: true, lignePl: true, montant: true },
    }),
  ]);

  type MonthlyPoint = { revActual: number; gmActual: number };
  type Agg = {
    entiteId: number; entite: string; clientNom: string;
    revActual: number; revTargetAnnual: number; gmActual: number; gmTargetAnnual: number;
    monthly: Map<number, MonthlyPoint>;
  };
  const map = new Map<string, Agg>();
  const ensure = (entiteId: number, entite: string, clientNom: string): Agg => {
    const key = `${entiteId}|${clientNom}`;
    if (!map.has(key)) {
      map.set(key, {
        entiteId, entite, clientNom,
        revActual: 0, revTargetAnnual: 0, gmActual: 0, gmTargetAnnual: 0, monthly: new Map(),
      });
    }
    return map.get(key)!;
  };

  for (const r of rows) {
    const agg = ensure(r.entiteId, r.entite.nomCourt, r.clientNom);
    const val = Number(r.montant);
    const point = agg.monthly.get(r.mois) ?? { revActual: 0, gmActual: 0 };
    if (r.lignePl === 'Revenue') { agg.revActual += val; point.revActual += val; }
    if (r.lignePl === 'Gross Margin') { agg.gmActual += val; point.gmActual += val; }
    agg.monthly.set(r.mois, point);
  }
  for (const t of targetRows) {
    const key = `${t.entiteId}|${t.clientNom}`;
    const agg = map.get(key);
    if (!agg) continue; // pas d'actuals pour ce client sur la période → ignoré
    if (t.lignePl === 'Revenue') agg.revTargetAnnual += Number(t.montant);
    if (t.lignePl === 'Gross Margin') agg.gmTargetAnnual += Number(t.montant);
  }

  // Correspondance client → groupe de consolidation.
  // Persistée dans dim_client_groupes, JAMAIS touchée par l'import → le mapping survit
  // à tous les ré-imports. Rapprochement insensible à la casse / aux espaces pour tolérer
  // de légères variations de libellé entre deux imports.
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const entiteIds = [...new Set(Array.from(map.values()).map(a => a.entiteId))];
  const groupeRows = entiteIds.length > 0
    ? await prisma.dimClientGroupe.findMany({ where: { entiteId: { in: entiteIds } } })
    : [];
  const groupeByKey = new Map(groupeRows.map(g => [`${g.entiteId}|${norm(g.clientNom)}`, g.groupe]));

  // Budget prorata YTD (annuel / 12 * mois écoulés) — même convention que les KPI P&L
  const revTargetYtd = (annual: number) => (annual / 12) * month;

  const clients = Array.from(map.values())
    .map(a => ({
      entiteId: a.entiteId,
      entite: a.entite,
      clientNom: a.clientNom,
      groupe: groupeByKey.get(`${a.entiteId}|${norm(a.clientNom)}`) ?? 'Others',
      revActual: a.revActual,
      revTarget: revTargetYtd(a.revTargetAnnual),
      revTargetAnnual: a.revTargetAnnual,
      gmActual: a.gmActual,
      gmTarget: revTargetYtd(a.gmTargetAnnual),
      achievement: a.revTargetAnnual !== 0 ? a.revActual / revTargetYtd(a.revTargetAnnual) : null,
      marginRate: a.revActual !== 0 ? a.gmActual / a.revActual : null,
      monthly: Array.from(a.monthly.entries())
        .map(([mois, v]) => ({ mois, ...v }))
        .sort((x, y) => x.mois - y.mois),
    }))
    .sort((x, y) => y.revActual - x.revActual);

  res.json({ bu, annee: year, mois: month, clients });
}

// GET /api/sales/consolidation/:bu/:annee/:mois
export async function getConsolidationClients(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const user = req.user!;
  const isRestricted = user.role === 'VIEWER';

  const entiteWhere = isRestricted && user.entitesAccess.length > 0
    ? { entiteId: { in: user.entitesAccess } }
    : {};

  const data = await prisma.faitRevenusClients.findMany({
    where: { bu, annee: year, mois: month, ...entiteWhere },
    include: { entite: true },
    orderBy: [{ entite: { nomCourt: 'asc' } }, { clientNom: 'asc' }],
  });

  res.json({ bu, annee: year, mois: month, data });
}
