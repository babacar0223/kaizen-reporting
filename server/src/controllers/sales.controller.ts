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
