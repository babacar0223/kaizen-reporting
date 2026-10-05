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
// Sens inverse — nécessaire pour réaffecter la colonne `bu` dénormalisée de FaitPl/FaitRevenusClients
// quand une entité change de BU (voir updateEntite).
const BU_FULL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(BU_COURT_MAP).map(([full, court]) => [court, full]),
);

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

// GET /referentiels/annees-disponibles?bu= — années distinctes ayant des données réelles importées
export async function getAnneesDisponibles(req: AuthRequest, res: Response): Promise<void> {
  const { bu } = req.query;
  const user = req.user!;
  const isRestricted = user.role === 'VIEWER';

  const rows = await prisma.faitPl.findMany({
    where: {
      ...(bu ? { bu: bu as string } : {}),
      ...(isRestricted && user.entitesAccess.length > 0 ? { entiteId: { in: user.entitesAccess } } : {}),
    },
    select: { annee: true },
    distinct: ['annee'],
    orderBy: { annee: 'desc' },
  });
  res.json(rows.map(r => r.annee));
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
  const id = parseInt(req.params.id as string);
  const newBuId = buId ? Number(buId) : undefined;

  const existing = await prisma.dimEntite.findUnique({ where: { id } });
  const buChanged = newBuId !== undefined && !!existing && newBuId !== existing.buId;

  const entite = await prisma.$transaction(async (tx) => {
    const updated = await tx.dimEntite.update({
      where: { id },
      data: { nom, nomCourt, ...(newBuId ? { buId: newBuId } : {}), deviseSource, tauxConversion, ratioBu, actif },
      include: { bu: true },
    });

    // Changer la BU d'affectation d'une entité doit déplacer tout son historique déjà importé.
    // FaitPl/FaitRevenusClients stockent une colonne `bu` dénormalisée (pour filtrer par BU sans
    // jointure) qui n'était pas mise à jour ici : les données restaient invisibles partout — plus
    // listées sous l'ancienne BU (l'entité n'y apparaît plus), toujours taguées ancienne BU sous
    // la nouvelle (aucune ligne ne matche le filtre `bu` des requêtes Figures/Statistics/Charts...).
    if (buChanged) {
      const newBu = BU_FULL_MAP[updated.bu.nomCourt] ?? updated.bu.nomCourt;
      await tx.faitPl.updateMany({ where: { entiteId: id }, data: { bu: newBu } });
      await tx.faitRevenusClients.updateMany({ where: { entiteId: id }, data: { bu: newBu } });
    }

    return updated;
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

// ── Groupes clients (consolidation Barrick / Tongon / Autres…) ────────────────
// GET /referentiels/client-groupes?entiteId= — mappings existants + noms de clients vus en base
export async function getClientGroupes(req: AuthRequest, res: Response): Promise<void> {
  const entiteId = req.query.entiteId ? parseInt(req.query.entiteId as string) : undefined;
  if (!entiteId || isNaN(entiteId)) { res.status(400).json({ message: 'entiteId requis' }); return; }
  const user = req.user!;
  if (user.role === 'VIEWER' && user.entitesAccess.length > 0 && !user.entitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }

  const [mappings, clientRows] = await Promise.all([
    prisma.dimClientGroupe.findMany({ where: { entiteId }, orderBy: [{ ordre: 'asc' }, { clientNom: 'asc' }] }),
    prisma.faitRevenusClients.findMany({
      where: { entiteId, lignePl: 'Revenue' },
      select: { clientNom: true },
      distinct: ['clientNom'],
      orderBy: { clientNom: 'asc' },
    }),
  ]);

  // Rapprochement insensible à la casse / aux espaces : un mapping enregistré reste
  // rattaché au bon client même si un ré-import a légèrement changé la casse du libellé.
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
  const mapByNom = new Map(mappings.map(m => [norm(m.clientNom), m]));
  const seen = new Set<string>();
  const clients = clientRows.map(c => {
    const hit = mapByNom.get(norm(c.clientNom));
    if (hit) seen.add(norm(c.clientNom));
    return { clientNom: c.clientNom, groupe: hit?.groupe ?? '', id: hit?.id ?? null };
  });
  // Inclure aussi d'éventuels mappings dont le client n'apparaît plus dans les faits
  for (const m of mappings) {
    if (!seen.has(norm(m.clientNom))) {
      clients.push({ clientNom: m.clientNom, groupe: m.groupe, id: m.id });
    }
  }

  res.json({ entiteId, clients });
}

// PUT /referentiels/client-groupes — upsert { entiteId, clientNom, groupe, ordre? }
// groupe vide ⇒ suppression du mapping (retour à "Autres")
export async function putClientGroupe(req: AuthRequest, res: Response): Promise<void> {
  const { entiteId, clientNom, groupe, ordre } = req.body as {
    entiteId?: number; clientNom?: string; groupe?: string; ordre?: number;
  };
  if (!entiteId || !clientNom) { res.status(400).json({ message: 'entiteId et clientNom requis' }); return; }

  const g = (groupe ?? '').trim();
  if (!g) {
    await prisma.dimClientGroupe.deleteMany({ where: { entiteId, clientNom } });
    res.json({ deleted: true });
    return;
  }

  const saved = await prisma.dimClientGroupe.upsert({
    where: { entiteId_clientNom: { entiteId, clientNom } },
    update: { groupe: g, ...(ordre !== undefined ? { ordre } : {}) },
    create: { entiteId, clientNom, groupe: g, ordre: ordre ?? 0 },
  });
  res.json(saved);
}

// DELETE /referentiels/client-groupes/:id
export async function deleteClientGroupe(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ message: 'ID invalide' }); return; }
  await prisma.dimClientGroupe.delete({ where: { id } });
  res.json({ deleted: true });
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
