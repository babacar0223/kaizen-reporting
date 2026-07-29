import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

function isViewer(user: AuthRequest['user']): boolean {
  return user?.role === 'VIEWER';
}

function toNum(d: unknown): number {
  return Number(d ?? 0);
}

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

// ── Référentiel : Entités ────────────────────────────────────────────────────
export async function getEntites(req: AuthRequest, res: Response): Promise<void> {
  const user = req.user!;
  const restricted = isViewer(user) && user.tresorerieEntitesAccess.length > 0;
  const entites = await prisma.tresorerieEntite.findMany({
    where: { actif: true, ...(restricted ? { id: { in: user.tresorerieEntitesAccess } } : {}) },
    orderBy: [{ groupe: 'asc' }, { pays: 'asc' }, { nom: 'asc' }],
  });
  res.json(entites);
}

export async function createEntite(req: AuthRequest, res: Response): Promise<void> {
  const { nom, pays, groupe } = req.body;
  const entite = await prisma.tresorerieEntite.create({ data: { nom, pays, groupe } });
  res.status(201).json(entite);
}

export async function updateEntite(req: AuthRequest, res: Response): Promise<void> {
  const { nom, pays, groupe, actif } = req.body;
  const entite = await prisma.tresorerieEntite.update({
    where: { id: parseInt(String(req.params.id)) },
    data: { nom, pays, groupe, actif },
  });
  res.json(entite);
}

// ── Référentiel : Banques ────────────────────────────────────────────────────
export async function getBanques(req: AuthRequest, res: Response): Promise<void> {
  const { entiteId } = req.query;
  const user = req.user!;
  const restricted = isViewer(user) && user.tresorerieEntitesAccess.length > 0;
  const banques = await prisma.tresorerieBanque.findMany({
    where: {
      actif: true,
      ...(entiteId ? { entiteId: parseInt(String(entiteId)) } : {}),
      ...(restricted ? { entiteId: { in: user.tresorerieEntitesAccess } } : {}),
    },
    include: { entite: true },
    orderBy: { nom: 'asc' },
  });
  res.json(banques);
}

export async function createBanque(req: AuthRequest, res: Response): Promise<void> {
  const { nom, entiteId, typeCompte, devise } = req.body;
  const banque = await prisma.tresorerieBanque.create({
    data: { nom, entiteId, typeCompte, devise },
    include: { entite: true },
  });
  res.status(201).json(banque);
}

export async function updateBanque(req: AuthRequest, res: Response): Promise<void> {
  const { nom, entiteId, typeCompte, devise, actif } = req.body;
  const banque = await prisma.tresorerieBanque.update({
    where: { id: parseInt(String(req.params.id)) },
    data: { nom, entiteId, typeCompte, devise, actif },
    include: { entite: true },
  });
  res.json(banque);
}

// ── Référentiel : Devises / taux de change ───────────────────────────────────
export async function getDevises(req: AuthRequest, res: Response): Promise<void> {
  const devises = await prisma.tresorerieDevise.findMany({ orderBy: { code: 'asc' } });
  res.json(devises);
}

export async function upsertDevise(req: AuthRequest, res: Response): Promise<void> {
  const { code, libelle, tauxXof } = req.body;
  const devise = await prisma.tresorerieDevise.upsert({
    where: { code },
    update: { libelle, tauxXof },
    create: { code, libelle, tauxXof },
  });
  res.json(devise);
}

// ── Saisie journalière ───────────────────────────────────────────────────────

// GET /tresorerie/saisie/:date?entiteId= — état du jour, avec brouillon pré-rempli pour les banques sans saisie
export async function getSaisieJour(req: AuthRequest, res: Response): Promise<void> {
  const dateStr = req.params.date as string;
  const entiteId = parseInt(String(req.query.entiteId));
  if (!entiteId) { res.status(400).json({ message: 'entiteId requis' }); return; }
  const date = parseDate(dateStr);

  const banques = await prisma.tresorerieBanque.findMany({
    where: { entiteId, actif: true },
    orderBy: { nom: 'asc' },
  });

  const rows = await Promise.all(
    banques.map(async (banque) => {
      const existing = await prisma.tresorerieSaisie.findUnique({
        where: { date_banqueId: { date, banqueId: banque.id } },
      });
      if (existing) {
        return {
          banqueId: banque.id,
          nomBanque: banque.nom,
          typeCompte: banque.typeCompte,
          devise: existing.devise,
          positionJMoins1: toNum(existing.positionJMoins1),
          entrees: toNum(existing.entrees),
          sorties: toNum(existing.sorties),
          positionJ: toNum(existing.positionJ),
          positionBanque: toNum(existing.positionBanque),
          caisseJMoins1: toNum(existing.caisseJMoins1),
          caisseJ: toNum(existing.caisseJ),
          commentaire: existing.commentaire ?? '',
          tauxXofUtilise: toNum(existing.tauxXofUtilise),
          saisi: true,
        };
      }
      const prior = await prisma.tresorerieSaisie.findFirst({
        where: { banqueId: banque.id, date: { lt: date } },
        orderBy: { date: 'desc' },
      });
      const devise = await prisma.tresorerieDevise.findUnique({ where: { code: banque.devise } });
      return {
        banqueId: banque.id,
        nomBanque: banque.nom,
        typeCompte: banque.typeCompte,
        devise: banque.devise,
        positionJMoins1: prior ? toNum(prior.positionJ) : 0,
        entrees: 0,
        sorties: 0,
        positionJ: prior ? toNum(prior.positionJ) : 0,
        positionBanque: prior ? toNum(prior.positionJ) : 0,
        caisseJMoins1: prior ? toNum(prior.caisseJ) : 0,
        caisseJ: prior ? toNum(prior.caisseJ) : 0,
        commentaire: '',
        tauxXofUtilise: devise ? toNum(devise.tauxXof) : 1,
        saisi: false,
      };
    })
  );

  res.json({ date: dateStr, entiteId, rows });
}

// POST /tresorerie/saisie — { date, entiteId, rows: [...] }
export async function batchUpsertSaisie(req: AuthRequest, res: Response): Promise<void> {
  const { date: dateStr, entiteId, rows } = req.body as {
    date: string;
    entiteId: number;
    rows: Array<{
      banqueId: number;
      positionJMoins1: number;
      entrees: number;
      sorties: number;
      positionBanque: number;
      caisseJMoins1: number;
      caisseJ: number;
      commentaire?: string;
    }>;
  };
  const date = parseDate(dateStr);
  const userId = req.user!.userId;

  // Sécurité : ne traiter que les banques appartenant réellement à l'entité annoncée
  const banques = await prisma.tresorerieBanque.findMany({ where: { entiteId } });
  const banqueMap = new Map(banques.map(b => [b.id, b]));

  const devises = await prisma.tresorerieDevise.findMany();
  const deviseMap = new Map(devises.map(d => [d.code, toNum(d.tauxXof)]));

  const results = await Promise.all(
    rows
      .filter(r => banqueMap.has(r.banqueId))
      .map(async (row) => {
        const banque = banqueMap.get(row.banqueId)!;
        const tauxXofUtilise = deviseMap.get(banque.devise) ?? 1;
        const positionJ = row.positionJMoins1 + row.entrees - row.sorties;
        return prisma.tresorerieSaisie.upsert({
          where: { date_banqueId: { date, banqueId: row.banqueId } },
          update: {
            devise: banque.devise,
            tauxXofUtilise,
            positionJMoins1: row.positionJMoins1,
            entrees: row.entrees,
            sorties: row.sorties,
            positionJ,
            positionBanque: row.positionBanque,
            caisseJMoins1: row.caisseJMoins1 ?? 0,
            caisseJ: row.caisseJ ?? 0,
            commentaire: row.commentaire,
          },
          create: {
            date,
            banqueId: row.banqueId,
            devise: banque.devise,
            tauxXofUtilise,
            positionJMoins1: row.positionJMoins1,
            entrees: row.entrees,
            sorties: row.sorties,
            positionJ,
            positionBanque: row.positionBanque,
            caisseJMoins1: row.caisseJMoins1 ?? 0,
            caisseJ: row.caisseJ ?? 0,
            commentaire: row.commentaire,
            createdById: userId,
          },
        });
      })
  );

  res.json({ saved: results.length });
}

// ── Dashboard consolidé ──────────────────────────────────────────────────────

// GET /tresorerie/dashboard/:date
export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const dateStr = req.params.date as string;
  const date = parseDate(dateStr);

  const saisies = await prisma.tresorerieSaisie.findMany({
    where: { date },
    include: { banque: { include: { entite: true } } },
  });

  type Row = {
    entite: string; pays: string; groupe: string; banque: string; devise: string;
    positionJ: number; positionBanque: number; positionJXof: number; positionBanqueXof: number;
    fluxNetXof: number; ecartXof: number;
  };
  const rows: Row[] = saisies.map(s => {
    const taux = toNum(s.tauxXofUtilise);
    const positionJ = toNum(s.positionJ);
    const positionBanque = toNum(s.positionBanque);
    const fluxNet = toNum(s.entrees) - toNum(s.sorties);
    return {
      entite: s.banque.entite.nom,
      pays: s.banque.entite.pays,
      groupe: s.banque.entite.groupe,
      banque: s.banque.nom,
      devise: s.devise,
      positionJ,
      positionBanque,
      positionJXof: positionJ * taux,
      positionBanqueXof: positionBanque * taux,
      fluxNetXof: fluxNet * taux,
      ecartXof: (positionJ - positionBanque) * taux,
    };
  });

  const positionTotaleXof = rows.reduce((s, r) => s + r.positionJXof, 0);
  const fluxNetXof = rows.reduce((s, r) => s + r.fluxNetXof, 0);
  const ecartTotalXof = rows.reduce((s, r) => s + r.ecartXof, 0);
  const nombreEntites = new Set(rows.map(r => r.entite)).size;

  // Hiérarchie Groupe → Pays → Entité
  type Node = { label: string; positionJXof: number; children?: Map<string, Node> };
  const tree = new Map<string, Node>();
  for (const r of rows) {
    if (!tree.has(r.groupe)) tree.set(r.groupe, { label: r.groupe, positionJXof: 0, children: new Map() });
    const groupeNode = tree.get(r.groupe)!;
    groupeNode.positionJXof += r.positionJXof;
    if (!groupeNode.children!.has(r.pays)) groupeNode.children!.set(r.pays, { label: r.pays, positionJXof: 0, children: new Map() });
    const paysNode = groupeNode.children!.get(r.pays)!;
    paysNode.positionJXof += r.positionJXof;
    if (!paysNode.children!.has(r.entite)) paysNode.children!.set(r.entite, { label: r.entite, positionJXof: 0 });
    const entiteNode = paysNode.children!.get(r.entite)!;
    entiteNode.positionJXof += r.positionJXof;
  }
  function serialize(node: Node): object {
    return {
      label: node.label,
      positionJXof: node.positionJXof,
      children: node.children ? Array.from(node.children.values()).map(serialize) : undefined,
    };
  }
  const hierarchie = Array.from(tree.values()).map(serialize);

  res.json({
    date: dateStr,
    kpi: { positionTotaleXof, fluxNetXof, ecartTotalXof, nombreEntites },
    hierarchie,
    banques: rows,
  });
}

// GET /tresorerie/historique/:banqueId?from=&to=
export async function getHistorique(req: AuthRequest, res: Response): Promise<void> {
  const banqueId = parseInt(String(req.params.banqueId));
  const { from, to } = req.query;
  const where: Record<string, unknown> = { banqueId };
  if (from || to) {
    where.date = {
      ...(from ? { gte: parseDate(String(from)) } : {}),
      ...(to ? { lte: parseDate(String(to)) } : {}),
    };
  }
  const saisies = await prisma.tresorerieSaisie.findMany({ where, orderBy: { date: 'asc' } });
  res.json(
    saisies.map(s => ({
      date: s.date.toISOString().slice(0, 10),
      positionJ: toNum(s.positionJ),
      positionJXof: toNum(s.positionJ) * toNum(s.tauxXofUtilise),
      positionBanque: toNum(s.positionBanque),
      ecart: toNum(s.positionJ) - toNum(s.positionBanque),
    }))
  );
}
