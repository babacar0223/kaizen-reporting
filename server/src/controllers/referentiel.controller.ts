import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// ── BU ──────────────────────────────────────────────────────────────────────
export async function getAllBu(req: Request, res: Response): Promise<void> {
  const bus = await prisma.dimBu.findMany({ include: { entites: true }, orderBy: { id: 'asc' } });
  res.json(bus);
}

// Map from app BU identifier (stored in faitPl.bu) → dimBu.nomCourt (abbreviation in DB)
const BU_COURT_MAP: Record<string, string> = {
  PROCUREMENT: 'PROC',
  FREIGHT_FORWARDING: 'FF',
  LOGISTICS: 'LOG',
};

// ── Entités ──────────────────────────────────────────────────────────────────
export async function getAllEntites(req: AuthRequest, res: Response): Promise<void> {
  const { bu } = req.query;
  const user = req.user!;
  const isRestricted = user.role === 'VIEWER';

  const buNomCourt = bu ? (BU_COURT_MAP[bu as string] ?? (bu as string)) : undefined;

  const entites = await prisma.dimEntite.findMany({
    where: {
      ...(buNomCourt ? { bu: { nomCourt: buNomCourt } } : {}),
      ...(isRestricted && user.entitesAccess.length > 0
        ? { id: { in: user.entitesAccess } }
        : {}),
    },
    include: { bu: true },
    orderBy: { nom: 'asc' },
  });
  res.json(entites);
}

export async function createEntite(req: Request, res: Response): Promise<void> {
  const { nom, nomCourt, buId, deviseSource, tauxConversion, ratioBu } = req.body;
  const entite = await prisma.dimEntite.create({
    data: { nom, nomCourt, buId, deviseSource: deviseSource || 'EUR', tauxConversion: tauxConversion || 1, ratioBu },
    include: { bu: true },
  });
  res.status(201).json(entite);
}

export async function updateEntite(req: Request, res: Response): Promise<void> {
  const { nom, nomCourt, buId, deviseSource, tauxConversion, ratioBu, actif } = req.body;
  const entite = await prisma.dimEntite.update({
    where: { id: parseInt(req.params.id as string) },
    data: { nom, nomCourt, ...(buId ? { buId } : {}), deviseSource, tauxConversion, ratioBu, actif },
    include: { bu: true },
  });
  res.json(entite);
}

export async function deleteEntite(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ message: 'ID invalide' }); return; }

  // Count before delete so we can report to the caller
  const [plCount, salesCount] = await Promise.all([
    prisma.faitPl.count({ where: { entiteId: id } }),
    prisma.faitRevenusClients.count({ where: { entiteId: id } }),
  ]);

  await prisma.$transaction(async (tx) => {
    // Delete leaf tables first to respect FK constraints
    const clients = await tx.dimClient.findMany({ where: { entiteId: id }, select: { id: true } });
    const clientIds = clients.map(c => c.id);
    if (clientIds.length > 0) {
      await tx.dimSousClient.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.dimClient.deleteMany({ where: { entiteId: id } });
    }
    await tx.faitRevenusClients.deleteMany({ where: { entiteId: id } });
    await tx.faitPl.deleteMany({ where: { entiteId: id } });
    await tx.dimEntite.delete({ where: { id } });
  });

  res.json({ deleted: true, plRecordsRemoved: plCount, salesRecordsRemoved: salesCount });
}

// ── Clients ──────────────────────────────────────────────────────────────────
export async function getClients(req: Request, res: Response): Promise<void> {
  const { entiteId } = req.query;
  const clients = await prisma.dimClient.findMany({
    where: entiteId ? { entiteId: parseInt(entiteId as string) } : undefined,
    include: { sousClients: true },
    orderBy: { nom: 'asc' },
  });
  res.json(clients);
}

export async function createClient(req: Request, res: Response): Promise<void> {
  const { nom, entiteId, bu, type } = req.body;
  const client = await prisma.dimClient.create({ data: { nom, entiteId, bu, type } });
  res.status(201).json(client);
}

export async function createSousClient(req: Request, res: Response): Promise<void> {
  const { nom, clientId, entiteId } = req.body;
  const sc = await prisma.dimSousClient.create({ data: { nom, clientId, entiteId } });
  res.status(201).json(sc);
}

// ── Lignes P&L ───────────────────────────────────────────────────────────────
export async function getLignesPl(req: Request, res: Response): Promise<void> {
  const lignes = await prisma.dimLignePl.findMany({ orderBy: { ordreAffichage: 'asc' } });
  res.json(lignes);
}

export async function createLignePl(req: Request, res: Response): Promise<void> {
  const { nom, ordreAffichage, type } = req.body;
  const ligne = await prisma.dimLignePl.create({ data: { nom, ordreAffichage, type } });
  res.status(201).json(ligne);
}
