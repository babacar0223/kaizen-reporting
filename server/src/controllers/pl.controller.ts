import { Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveEntiteIds, isCompositeEntite, groupKeyOf } from '../lib/entiteGroups';

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

function isViewer(user: AuthRequest['user']): boolean {
  return user?.role === 'VIEWER';
}

// Lignes "stock" (photo à un instant donné, ex: effectif) : la valeur du mois le plus
// récent doit être retenue, pas la somme des mois — contrairement aux lignes de flux (Revenue, etc.)
const STOCK_LINES = new Set(['Staff Number']);

// Lignes "taux / ratio par employé" : une moyenne a du sens, jamais une somme — voir le même
// commentaire dans stats.controller.ts (getStats).
const RATE_LINES = new Set(['Nominal Income Tax Rate (%)', 'Average VAT Rate (%)', 'Gross Margin per Staff', 'Operating Cost per Staff']);

// GET /api/pl/:bu/:annee/:mois — P&L consolidé BU
export async function getPlBu(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const user = req.user!;

  const entityFilter = isViewer(user) && user.entitesAccess.length > 0
    ? { entiteId: { in: user.entitesAccess } }
    : {};

  // MTD actuals: sum only within the requested month range
  const mtdRows = await prisma.faitPl.findMany({
    where: { bu, annee: year, typePeriode: 'MTD', mois: { lte: month }, ...entityFilter },
    include: { entite: true, lignePl: true },
    orderBy: [{ lignePl: { ordreAffichage: 'asc' } }],
  });

  // YTD rows (budget targets, N-1 baselines): always fetch for the full year
  // so that budget stored at a later reference month is always visible.
  // typeValeur restreint à TARGET/YTD_N1 : l'ancien import BU dédié (Procurement/Freight Forwarding)
  // écrit aussi des lignes typePeriode='YTD' avec typeValeur='ACTUALS' pour un usage différent —
  // sans ce filtre elles se retrouveraient mélangées aux vraies valeurs mensuelles ACTUALS ci-dessous.
  const ytdRows = await prisma.faitPl.findMany({
    where: { bu, annee: year, typePeriode: 'YTD', typeValeur: { in: ['TARGET', 'YTD_N1'] }, ...entityFilter },
    include: { entite: true, lignePl: true },
    orderBy: [{ lignePl: { ordreAffichage: 'asc' } }, { mois: 'desc' }],
  });

  // Entités filles d'un groupe consolidé (ex. Local/International Procurement) : leurs montants
  // doivent apparaître sous le nom de l'entité mère (Afrilog International), jamais séparément —
  // même convention que getKpiBu/getStats (resolveEntiteIds/groupKeyOf).
  const parentIdsNeeded = new Set<number>();
  for (const row of [...mtdRows, ...ytdRows]) {
    const g = groupKeyOf(row.entiteId);
    if (g !== row.entiteId) parentIdsNeeded.add(g);
  }
  const parentEntites = parentIdsNeeded.size
    ? await prisma.dimEntite.findMany({ where: { id: { in: [...parentIdsNeeded] } } })
    : [];
  const parentNameById = new Map(parentEntites.map(e => [e.id, e.nomCourt]));
  function displayName(row: { entiteId: number; entite: { nomCourt: string } }): string {
    const groupId = groupKeyOf(row.entiteId);
    return groupId !== row.entiteId ? (parentNameById.get(groupId) ?? row.entite.nomCourt) : row.entite.nomCourt;
  }

  const map = new Map<string, { entite: string; lignePl: string; typeValeur: string; montant: number }>();
  const ytdSeen = new Set<string>();
  // YTD_N1 saisi à l'identique dans chaque entité fille : ne compter qu'une fois par groupe,
  // contrairement à TARGET qui est propre à chaque entité et doit s'additionner normalement.
  const n1Seen = new Set<string>();

  // YTD: most-recent month per (entiteId, ligne, typeValeur) wins
  for (const row of ytdRows) {
    const ytdKey = `${row.entiteId}|${row.lignePl.nom}|${row.typeValeur}`;
    if (ytdSeen.has(ytdKey)) continue;
    ytdSeen.add(ytdKey);
    if (row.typeValeur === 'YTD_N1') {
      const n1Key = `${row.lignePl.nom}|${groupKeyOf(row.entiteId)}`;
      if (n1Seen.has(n1Key)) continue;
      n1Seen.add(n1Key);
    }
    const name = displayName(row);
    const key = `${name}|${row.lignePl.nom}|${row.typeValeur}`;
    const existing = map.get(key);
    if (existing) existing.montant += Number(row.montant);
    else map.set(key, { entite: name, lignePl: row.lignePl.nom, typeValeur: row.typeValeur, montant: Number(row.montant) });
  }

  // MTD: sum across months (except "stock" lines, where the latest month wins)
  const latestMoisSeen = new Map<string, number>();
  for (const row of mtdRows) {
    const name = displayName(row);
    const key = `${name}|${row.lignePl.nom}|${row.typeValeur}`;
    const existing = map.get(key);
    if (STOCK_LINES.has(row.lignePl.nom)) {
      const seen = latestMoisSeen.get(key) ?? -1;
      if (row.mois > seen) {
        latestMoisSeen.set(key, row.mois);
        map.set(key, { entite: name, lignePl: row.lignePl.nom, typeValeur: row.typeValeur, montant: Number(row.montant) });
      } else if (row.mois === seen && map.has(key)) {
        map.get(key)!.montant += Number(row.montant);
      }
    } else if (existing) {
      existing.montant += Number(row.montant);
    } else {
      map.set(key, { entite: name, lignePl: row.lignePl.nom, typeValeur: row.typeValeur, montant: Number(row.montant) });
    }
  }

  res.json({ bu, annee: year, mois: month, data: Array.from(map.values()) });
}

// GET /api/pl/:bu/:entiteId/:annee/:mois — P&L mensuel détaillé
export async function getPlEntite(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const eId = parseInt(req.params.entiteId as string);
  const user = req.user!;

  if (isViewer(user) && user.entitesAccess.length > 0 && !user.entitesAccess.includes(eId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }

  const scopeIds = resolveEntiteIds(eId);
  const data = await prisma.faitPl.findMany({
    where: { bu, entiteId: { in: scopeIds }, annee: year, mois: { lte: month } },
    include: { lignePl: true },
    orderBy: [{ lignePl: { ordreAffichage: 'asc' } }, { mois: 'asc' }],
  });

  // Convertir Decimal Prisma en number (sinon JSON sérialise en string → bug de concaténation côté client)
  let normalized = data.map(r => ({ ...r, montant: parseFloat(String(r.montant)) }));

  // Entité consolidée (ex. Afrilog International = Local + International Procurement) : le
  // frontend attend une seule ligne par (ligne P&L, mois, type de valeur, période), comme pour
  // une entité normale.
  // MTD = valeur mensuelle (flux) : on somme les mois identiques, chaque mois reste distinct.
  // TARGET (budget) = propre à chaque fille : on somme toutes les filles et on garde le mois le
  // plus récent, compatible avec la logique "most-recent-mois-wins" du reste de la plateforme.
  // YTD_N1 (2025, colonne B) = valeur déjà consolidée saisie à l'identique dans chaque fille :
  // on ne la compte qu'une fois, pas de cumul.
  if (scopeIds.length > 1) {
    const merged = new Map<string, typeof normalized[number]>();
    for (const r of normalized) {
      if (r.typePeriode === 'YTD' && r.typeValeur === 'YTD_N1') {
        const key = `${r.lignePlId}|${r.typeValeur}|${r.typePeriode}`;
        if (!merged.has(key)) merged.set(key, { ...r, entiteId: eId });
        continue;
      }
      const key = r.typePeriode === 'YTD'
        ? `${r.lignePlId}|${r.typeValeur}|${r.typePeriode}`
        : `${r.lignePlId}|${r.mois}|${r.typeValeur}|${r.typePeriode}`;
      const existing = merged.get(key);
      if (existing) {
        existing.montant += r.montant;
        if (r.mois > existing.mois) existing.mois = r.mois;
      } else {
        merged.set(key, { ...r, entiteId: eId });
      }
    }
    normalized = Array.from(merged.values());
  }

  res.json({ bu, entiteId: eId, annee: year, mois: month, data: normalized });
}

// POST /api/admin/pl — Saisie ou upsert d'une ligne P&L
export async function upsertPl(req: AuthRequest, res: Response): Promise<void> {
  const { entiteId, bu, lignePlId, annee, mois, typeValeur, typePeriode, montant, sourceOnglet } = req.body;
  const user = req.user!;
  if (isViewer(user) && user.entitesAccess.length > 0 && !user.entitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Accès à cette entité refusé' });
    return;
  }
  if (isCompositeEntite(entiteId)) {
    res.status(400).json({ message: 'Cette entité est consolidée : saisissez directement dans ses entités filles' });
    return;
  }
  const date = lastDayOfMonth(annee, mois);

  const result = await prisma.faitPl.upsert({
    where: {
      date_entiteId_lignePlId_typeValeur_typePeriode: {
        date, entiteId, lignePlId, typeValeur, typePeriode,
      },
    },
    update: { montant, sourceOnglet, updatedAt: new Date() },
    create: { date, annee, mois, entiteId, bu, lignePlId, typeValeur, typePeriode, montant, sourceOnglet },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'CREATE',
      tableName: 'fait_pl',
      entiteId,
      periode: `${annee}-${String(mois).padStart(2, '0')}`,
      details: { lignePlId, typeValeur, typePeriode, montant },
    },
  });

  res.json(result);
}

// POST /api/admin/pl/batch
export async function batchUpsertPl(req: AuthRequest, res: Response): Promise<void> {
  const { rows } = req.body as {
    rows: Array<{
      entiteId: number;
      bu: string;
      lignePlId: number;
      annee: number;
      mois: number;
      typeValeur: string;
      typePeriode: string;
      montant: number;
      sourceOnglet?: string;
    }>;
  };

  const user = req.user!;
  if (isViewer(user) && user.entitesAccess.length > 0) {
    const unauthorized = rows.find(r => !user.entitesAccess.includes(r.entiteId));
    if (unauthorized) {
      res.status(403).json({ message: `Accès à l'entité ${unauthorized.entiteId} refusé` });
      return;
    }
  }
  const composite = rows.find(r => isCompositeEntite(r.entiteId));
  if (composite) {
    res.status(400).json({ message: `L'entité ${composite.entiteId} est consolidée : saisissez directement dans ses entités filles` });
    return;
  }

  const results = await Promise.all(
    rows.map(async (row) => {
      const date = lastDayOfMonth(row.annee, row.mois);
      return prisma.faitPl.upsert({
        where: {
          date_entiteId_lignePlId_typeValeur_typePeriode: {
            date,
            entiteId: row.entiteId,
            lignePlId: row.lignePlId,
            typeValeur: row.typeValeur,
            typePeriode: row.typePeriode,
          },
        },
        update: { montant: row.montant, sourceOnglet: row.sourceOnglet, updatedAt: new Date() },
        create: { date, ...row },
      });
    })
  );

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'CREATE',
      tableName: 'fait_pl',
      details: { count: results.length, bu: rows[0]?.bu, annee: rows[0]?.annee, mois: rows[0]?.mois },
    },
  });

  res.json({ updated: results.length });
}

// GET /admin/export/pl/:bu/:entiteId/:annee
export async function exportEntityPl(req: AuthRequest, res: Response): Promise<void> {
  const bu  = req.params.bu as string;
  const eId = parseInt(req.params.entiteId as string);
  const yr  = parseInt(req.params.annee as string);
  const user = req.user!;

  if (isViewer(user) && user.entitesAccess.length > 0 && !user.entitesAccess.includes(eId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }

  const entite = await prisma.dimEntite.findUnique({ where: { id: eId }, include: { bu: true } });
  if (!entite) { res.status(404).json({ message: 'Entité introuvable' }); return; }

  // Entité consolidée (ex. Afrilog International) : on somme les lignes de ses entités filles.
  const rows = await prisma.faitPl.findMany({
    where: { entiteId: { in: resolveEntiteIds(eId) }, annee: yr },
    include: { lignePl: true },
    orderBy: [{ lignePl: { ordreAffichage: 'asc' } }, { mois: 'asc' }],
  });

  type RK = string;
  const data = new Map<RK, number>();
  for (const r of rows) {
    const nom = r.lignePl.nom;
    const tv  = r.typeValeur;
    // YTD (budget, N-1) = valeur de référence annuelle : on somme toutes les entités concernées,
    // quel que soit le mois où chacune l'a stockée — SAUF YTD_N1 (2025, colonne B), déjà
    // consolidée et saisie à l'identique dans chaque fille : on ne la compte qu'une fois.
    // MTD = valeur mensuelle : on somme les mois identiques.
    const ky = r.typePeriode === 'YTD' ? `${nom}|ytd|${tv}` : `${nom}|${r.mois}|${tv}`;
    if (tv === 'YTD_N1') {
      if (!data.has(ky)) data.set(ky, Number(r.montant));
    } else {
      data.set(ky, (data.get(ky) ?? 0) + Number(r.montant));
    }
  }

  const get = (nom: string, m: number | 'ytd', tv: string) => data.get(`${nom}|${m}|${tv}`) ?? 0;

  const MFR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const filledMonths: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const hasData = rows.some(r => r.mois === m && r.typePeriode === 'MTD' && Number(r.montant) !== 0);
    if (hasData) filledMonths.push(m);
  }
  const months = filledMonths.length > 0 ? filledMonths : [1];

  const MAIN_LINES = [
    { nom: 'Revenue',                       bold: false },
    { nom: 'Cost of Sales',                 bold: false },
    { nom: 'Gross Margin',                  bold: true  },
    { nom: 'Overheads',                     bold: false },
    { nom: 'Other Operating Expenses',      bold: false },
    { nom: 'Bad Debt Provision',            bold: false },
    { nom: 'Provisions for Risks',          bold: false },
    { nom: 'Other Operating Charges',       bold: true  },
    { nom: 'Proceeds from Asset Sales',     bold: false },
    { nom: 'Bonus/Malus Disbursements',     bold: false },
    { nom: 'Other Operating Revenues',      bold: false },
    { nom: 'Reversal Bad Debt Provision',   bold: false },
    { nom: 'Reversal Provisions for Risks', bold: false },
    { nom: 'Other Current Revenues',        bold: true  },
    { nom: 'EBITDA',                        bold: true  },
    { nom: 'Depreciation',                  bold: false },
    { nom: 'Operating Income',              bold: true  },
    { nom: 'Financial Expenses',            bold: false },
    { nom: 'Financial Income',              bold: false },
    { nom: 'Net Cost of Debt',              bold: true  },
    { nom: 'Other Financial Expenses',      bold: false },
    { nom: 'Other Financial Revenues',      bold: false },
    { nom: 'Other Financial Gain & Loss',   bold: true  },
    { nom: 'Profit Before Tax',             bold: true  },
    { nom: 'Income Tax',                    bold: false },
    { nom: 'Net Earnings',                  bold: true  },
    { nom: 'Cash Flow',                     bold: true  },
    { nom: 'Working Days',                  bold: false },
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('P&L');

  const boldFont = { bold: true,  name: 'Calibri', size: 10 };
  const regFont  = { bold: false, name: 'Calibri', size: 10 };
  const hdrFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
  const subFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E8F7' } };
  const totFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5D9F1' } };
  const numFmt   = '#,##0';

  const colCount = 1 + 1 + months.length + 1 + 1;
  ws.columns = [
    { width: 45 },
    { width: 15 },
    ...months.map(() => ({ width: 13 })),
    { width: 14 },
    { width: 14 },
  ];

  const r1 = ws.getRow(1);
  r1.getCell(1).value = `${entite.nom} (${(entite as any).bu?.nomCourt ?? bu})`;
  r1.getCell(1).font = { bold: true, size: 12, name: 'Calibri' };
  r1.getCell(2).value = `Année ${yr}`;
  r1.getCell(2).font = regFont;

  const r2 = ws.getRow(2);
  const headers = ['Ligne P&L', 'Budget YTD', ...months.map(m => MFR[m - 1]), 'Total', 'YTD N-1'];
  headers.forEach((h, i) => {
    const c = r2.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, name: 'Calibri', size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = hdrFill;
    c.alignment = i > 0 ? { horizontal: 'right' } : { horizontal: 'left' };
  });

  let rowIdx = 3;
  for (const line of MAIN_LINES) {
    const xl = ws.getRow(rowIdx);
    xl.getCell(1).value = line.nom;
    xl.getCell(1).font = line.bold ? boldFont : regFont;

    const budget = get(line.nom, 'ytd', 'TARGET');
    xl.getCell(2).value = budget || null;
    xl.getCell(2).numFmt = numFmt;
    xl.getCell(2).font = line.bold ? boldFont : regFont;

    let total = 0;
    months.forEach((m, i) => {
      const v = get(line.nom, m, 'ACTUALS');
      total += v;
      const c = xl.getCell(3 + i);
      c.value = v || null;
      c.numFmt = numFmt;
      c.font = line.bold ? boldFont : regFont;
      c.alignment = { horizontal: 'right' };
    });

    const tc = xl.getCell(3 + months.length);
    tc.value = total || null;
    tc.numFmt = numFmt;
    tc.font = boldFont;

    const n1 = get(line.nom, 'ytd', 'YTD_N1');
    const nc = xl.getCell(4 + months.length);
    nc.value = n1 || null;
    nc.numFmt = numFmt;
    nc.font = regFont;

    if (line.bold) {
      const fill = line.nom === 'Net Earnings' || line.nom === 'Cash Flow' ? totFill : subFill;
      for (let c = 1; c <= colCount; c++) xl.getCell(c).fill = fill;
    }

    xl.getCell(1).alignment = { horizontal: 'left' };
    rowIdx++;
  }

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colCount } };

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="PL_${entite.nomCourt}_${yr}.xlsx"`);
  res.send(Buffer.from(buf as ArrayBuffer));
}

// GET /api/kpi/bu/:bu/:annee/:mois?entiteId=&moisMin= — KPIs synthétiques
export async function getKpiBu(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const entiteId = req.query.entiteId ? parseInt(req.query.entiteId as string) : undefined;
  // Fenêtre de sommation des Actuals (mois en cours) — par défaut 1 = depuis janvier, comportement
  // historique inchangé pour tous les appelants existants. Budget/YTD N-1 restent toujours "tel
  // qu'importé jusqu'au mois de référence", indépendamment de moisMin — même convention que partout
  // ailleurs dans la plateforme (EntityMonthlyTable, PlBuPage…).
  const moisMinRaw = req.query.moisMin ? parseInt(req.query.moisMin as string) : 1;
  const moisMin = isFinite(moisMinRaw) && moisMinRaw >= 1 && moisMinRaw <= month ? moisMinRaw : 1;
  const user = req.user!;

  const restricted = isViewer(user) && user.entitesAccess.length > 0;
  if (restricted && entiteId && !user.entitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }
  const entityFilter = restricted ? { entiteId: { in: user.entitesAccess } } : {};
  const entiteFilter = entiteId ? { entiteId: { in: resolveEntiteIds(entiteId) } } : {};

  const mtdRows = await prisma.faitPl.findMany({
    where: { bu, annee: year, typePeriode: 'MTD', mois: { gte: moisMin, lte: month }, ...entityFilter, ...entiteFilter },
    include: { lignePl: true },
    orderBy: { mois: 'desc' },
  });

  // typeValeur restreint à TARGET/YTD_N1 — voir le même commentaire dans getPlBu : l'ancien import
  // BU Procurement/Freight Forwarding écrit aussi typePeriode='YTD' avec typeValeur='ACTUALS'.
  const ytdRows = await prisma.faitPl.findMany({
    where: { bu, annee: year, typePeriode: 'YTD', typeValeur: { in: ['TARGET', 'YTD_N1'] }, ...entityFilter, ...entiteFilter },
    include: { lignePl: true },
    orderBy: { mois: 'desc' },
  });

  const kpis: Record<string, Record<string, number>> = {};
  const ytdSeen = new Set<string>();
  // YTD_N1 (2025, colonne B) est une valeur déjà consolidée saisie à l'identique dans chaque
  // entité fille (Local + International Procurement) : on ne l'additionne qu'une fois par
  // groupe (l'entité elle-même si elle n'a pas de parent), contrairement à TARGET qui est
  // propre à chaque entité et doit s'additionner normalement.
  const n1Seen = new Set<string>();
  // RATE_LINES : moyenne, pas somme — voir le commentaire sur RATE_LINES plus haut.
  const rateCountYtd = new Map<string, number>(); // clé: ligne|type

  for (const row of ytdRows) {
    const ytdKey = `${row.entiteId}|${row.lignePl.nom}|${row.typeValeur}`;
    if (ytdSeen.has(ytdKey)) continue;
    ytdSeen.add(ytdKey);
    const nom = row.lignePl.nom;
    if (!kpis[nom]) kpis[nom] = {};
    if (row.typeValeur === 'YTD_N1') {
      const groupKey = `${nom}|${groupKeyOf(row.entiteId)}`;
      if (n1Seen.has(groupKey)) continue;
      n1Seen.add(groupKey);
    }
    kpis[nom][row.typeValeur] = (kpis[nom][row.typeValeur] || 0) + Number(row.montant);
    if (RATE_LINES.has(nom)) {
      const key = `${nom}|${row.typeValeur}`;
      rateCountYtd.set(key, (rateCountYtd.get(key) || 0) + 1);
    }
  }

  // mtdRows is ordered by mois desc, so for "stock" lines we track each entity's own latest
  // month separately (stockPerEntity) and only sum across entities at the end — otherwise an
  // entity that hasn't reported the globally-latest month of the whole scope would be dropped
  // entirely instead of contributing its own latest value.
  const stockPerEntity = new Map<string, number>(); // clé: entiteId|ligne|type
  const stockSeenEntity = new Set<string>();
  for (const row of mtdRows) {
    const nom = row.lignePl.nom;
    if (!kpis[nom]) kpis[nom] = {};
    if (STOCK_LINES.has(nom)) {
      const entKey = `${row.entiteId}|${nom}|${row.typeValeur}`;
      if (!stockSeenEntity.has(entKey)) {
        stockSeenEntity.add(entKey);
        stockPerEntity.set(entKey, Number(row.montant));
      }
      // older month for this entity — ignored on purpose (stock semantics)
    } else if (RATE_LINES.has(nom)) {
      kpis[nom][row.typeValeur] = (kpis[nom][row.typeValeur] || 0) + Number(row.montant);
      const key = `${nom}|${row.typeValeur}`;
      rateCountYtd.set(key, (rateCountYtd.get(key) || 0) + 1);
    } else {
      kpis[nom][row.typeValeur] = (kpis[nom][row.typeValeur] || 0) + Number(row.montant);
    }
  }
  for (const [key, val] of stockPerEntity) {
    const [, nom, tv] = key.split('|');
    if (!kpis[nom]) kpis[nom] = {};
    kpis[nom][tv] = (kpis[nom][tv] || 0) + val;
  }
  for (const [key, count] of rateCountYtd) {
    const [nom, tv] = key.split('|');
    if (kpis[nom]?.[tv] !== undefined && count > 0) kpis[nom][tv] = kpis[nom][tv] / count;
  }

  res.json({ bu, annee: year, mois: month, kpis });
}

// DELETE /api/admin/pl/entity/:entiteId/year/:annee — Reset all P&L and sales data for an entity/year
export async function resetEntityPlData(req: AuthRequest, res: Response): Promise<void> {
  const entiteId = parseInt(req.params.entiteId as string);
  const annee    = parseInt(req.params.annee as string);

  const [plDel, salesDel] = await prisma.$transaction([
    prisma.faitPl.deleteMany({ where: { entiteId, annee } }),
    prisma.faitRevenusClients.deleteMany({ where: { entiteId, annee } }),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: 'RESET_PL_DATA',
      tableName: 'fait_pl',
      entiteId,
      periode: String(annee),
      details: { plDeleted: plDel.count, salesDeleted: salesDel.count },
    },
  });

  res.json({ plDeleted: plDel.count, salesDeleted: salesDel.count });
}
