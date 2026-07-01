import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';

const TAUX_CFA_EUR = parseFloat(process.env.TAUX_CFA_EUR || '655.957');

// ── Mapping libellés BU dans le fichier → code interne ─────────────────────
const BU_LABEL_MAP: Record<string, string> = {
  'BU LOGISTIQUE': 'LOGISTICS',
  'BU LOGISTIQUES': 'LOGISTICS',
  'LOGISTIQUE': 'LOGISTICS',
  'LOGISTICS': 'LOGISTICS',
  'BU PROCUREMENT': 'PROCUREMENT',
  'PROCUREMENT': 'PROCUREMENT',
  'BU FREIGHT FORWARDING': 'FREIGHT_FORWARDING',
  'FREIGHT FORWARDING': 'FREIGHT_FORWARDING',
  'BU FF': 'FREIGHT_FORWARDING',
  'FF': 'FREIGHT_FORWARDING',
};

// ── Mapping index de ligne (0-based) → nom dimLignePl ──────────────────────
// Feuille "PL" : row 3 (idx 2) = headers, data from row 5 (idx 4)
// Col 0=label, 1=Budget YTD, 2=janv … 13=déc, 14=Total, 15=YTD N-1
const PL_ROW_MAP: Record<number, string> = {
  4:  'Revenue',
  5:  'Cost of Sales',
  6:  'Gross Margin',
  // 7 = % gross Margin (ratio calculé → skip)
  8:  'Overheads',
  9:  'Other Operating Expenses',
  10: 'Bad Debt Provision',
  11: 'Provisions for Risks',
  12: 'Other Operating Charges',
  13: 'Proceeds from Asset Sales',
  14: 'Bonus/Malus Disbursements',
  15: 'Other Operating Revenues',
  16: 'Reversal Bad Debt Provision',
  17: 'Reversal Provisions for Risks',
  18: 'Other Current Revenues',
  19: 'EBITDA',
  20: 'Depreciation',
  21: 'Operating Income',
  22: 'Financial Expenses',
  23: 'Financial Income',
  24: 'Net Cost of Debt',
  25: 'Other Financial Expenses',
  26: 'Other Financial Revenues',
  27: 'Other Financial Gain & Loss',
  28: 'Profit Before Tax',
  29: 'Income Tax',
  30: 'Net Earnings',
  31: 'Cash Flow',
  32: 'Working Days',
  // Statistiques & ratios (R34-R45 = idx 33-44)
  33: 'Income Tax / Profit Before Tax (%)',
  34: 'Net Earnings / Gross Margin (%)',
  35: 'Overheads / Gross Margin (%)',
  36: 'EBITDA / Gross Margin (%)',
  37: 'Depreciation / Gross Margin (%)',
  38: 'Operating Income / Gross Margin (%)',
  39: 'Financial Expenses / Gross Margin (%)',
  40: 'Nominal Income Tax Rate (%)',
  41: 'Average VAT Rate (%)',
  42: 'Staff Number',
  43: 'Gross Margin per Staff',
  44: 'Operating Cost per Staff',
  // Détail frais généraux (R48-R70 = idx 47-69)
  47: 'Rent & Leasing',
  48: 'Fuel',
  49: 'Water & Electricity',
  50: 'Maintenance',
  51: 'Fees & Penalties',
  52: 'Taxes (non-corporate)',
  53: 'Salaries and personnel cost',
  54: 'Travels, Hotels & Missions',
  55: 'Staff Transport',
  56: 'Professional Fees',
  57: 'Temporary Staff',
  58: 'Insurance',
  59: 'Communications',
  60: 'Bank Charges',
  61: 'Office Supplies',
  62: 'Donations & Gifts',
  63: 'Professional Org. Contributions',
  64: 'Small Equipment',
  65: 'General Documentation',
  66: 'Seminars',
  67: 'Advertising',
  68: 'Other Overhead Charges',
  69: 'Management Fees',
};

// Rows that must NOT have CFA→EUR conversion (dimensionless ratios, % rates, staff count)
const PL_NO_CONVERT_INDICES = new Set<number>([33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

function cfaToEur(amount: number): number {
  return amount / TAUX_CFA_EUR;
}

function numericValue(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

// ── PROCUREMENT: onglet BU PROC P&L ─────────────────────────────────────────
export async function importProcurementPl(
  buffer: Buffer,
  annee: number,
  mois: number,
  userId: number
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets['BU PROC P&L'] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { result.errors.push('Onglet BU PROC P&L introuvable'); return result; }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // Colonnes selon le CDC: W=Actuals AFRILOG SA, X=Target AFRILOG SA, Z=Actuals CTA NV, etc.
  const entiteColMap = [
    { nomCourt: 'AFRILOG SA', colActuals: 22, colTarget: 23 },  // W=22, X=23 (0-indexed)
    { nomCourt: 'CTA NV', colActuals: 25, colTarget: 26 },       // Z=25, AA=26
    { nomCourt: 'CTA SN', colActuals: 28, colTarget: 29 },       // AC=28, AD=29
    { nomCourt: 'AFRILOG INTL', colActuals: 31, colTarget: 32 }, // AF=31, AG=32
  ];

  // Lignes selon CDC: 10=Revenue, 18=GM, 26=Overheads, 30=Op.Inc.before, 32=Op.Inc., 34=Net Earnings
  const ligneRowMap: Record<number, string> = {
    9: 'Revenue',
    17: 'Gross Margin',
    25: 'Overheads',
    29: 'Operating Income before M.Fees',
    31: 'Operating Income',
    33: 'Net Earnings',
  };

  const lignes = await prisma.dimLignePl.findMany();
  const ligneMap = new Map(lignes.map(l => [l.nom, l.id]));

  const entites = await prisma.dimEntite.findMany({ where: { bu: { nomCourt: 'PROC' } }, include: { bu: true } });
  const entiteMap = new Map(entites.map(e => [e.nomCourt, e]));

  for (const [rowIdx, ligneName] of Object.entries(ligneRowMap)) {
    const row = data[parseInt(rowIdx)];
    if (!row) continue;
    const lignePlId = ligneMap.get(ligneName);
    if (!lignePlId) continue;

    for (const { nomCourt, colActuals, colTarget } of entiteColMap) {
      const entite = entiteMap.get(nomCourt);
      if (!entite) continue;

      const actuals = numericValue(row[colActuals]);
      const target = numericValue(row[colTarget]);
      const date = lastDayOfMonth(annee, mois);

      for (const [typeValeur, montant] of [['ACTUALS', actuals], ['TARGET', target]] as [string, number][]) {
        try {
          const existing = await prisma.faitPl.findUnique({
            where: {
              date_entiteId_lignePlId_typeValeur_typePeriode: {
                date, entiteId: entite.id, lignePlId, typeValeur, typePeriode: 'YTD',
              },
            },
          });
          if (existing) {
            await prisma.faitPl.update({
              where: { id: existing.id },
              data: { montant, sourceOnglet: 'BU PROC P&L' },
            });
            result.updated++;
          } else {
            await prisma.faitPl.create({
              data: { date, annee, mois, entiteId: entite.id, bu: 'PROCUREMENT', lignePlId, typeValeur, typePeriode: 'YTD', montant, sourceOnglet: 'BU PROC P&L' },
            });
            result.created++;
          }
        } catch (e) {
          result.errors.push(`Erreur ${nomCourt} ${ligneName} ${typeValeur}: ${e}`);
        }
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'IMPORT',
      tableName: 'fait_pl',
      periode: `${annee}-${String(mois).padStart(2, '0')}`,
      details: { bu: 'PROCUREMENT', ...result },
    },
  });

  return result;
}

// ── FREIGHT FORWARDING: structure similaire Procurement — colonnes par entité ──
export async function importFreightForwardingPl(
  buffer: Buffer,
  annee: number,
  mois: number,
  userId: number
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Try the FF P&L sheet name; fall back to first sheet
  const sheet = wb.Sheets['BU FF P&L'] || wb.Sheets['FF P&L'] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { result.errors.push('Onglet BU FF P&L introuvable'); return result; }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // Column layout mirrors Procurement sheet — will be confirmed with real template
  // Using nomCourt as the source of truth for entity lookup
  const entiteColMap = [
    { nomCourt: 'MULTILOG SA', colActuals: 22, colTarget: 23 },
    { nomCourt: 'UFI',         colActuals: 25, colTarget: 26 },
    { nomCourt: 'UFI USA',     colActuals: 28, colTarget: 29 },
    { nomCourt: 'AGS',         colActuals: 31, colTarget: 32 },
  ];

  const ligneRowMap: Record<number, string> = {
    9:  'Revenue',
    17: 'Gross Margin',
    25: 'Overheads',
    29: 'Operating Income before M.Fees',
    31: 'Operating Income',
    33: 'Net Earnings',
  };

  const lignes = await prisma.dimLignePl.findMany();
  const ligneMap = new Map(lignes.map(l => [l.nom, l.id]));

  const entites = await prisma.dimEntite.findMany({ where: { bu: { nomCourt: 'FF' } }, include: { bu: true } });
  const entiteMap = new Map(entites.map(e => [e.nomCourt, e]));

  for (const [rowIdx, ligneName] of Object.entries(ligneRowMap)) {
    const row = data[parseInt(rowIdx)];
    if (!row) continue;
    const lignePlId = ligneMap.get(ligneName);
    if (!lignePlId) continue;

    for (const { nomCourt, colActuals, colTarget } of entiteColMap) {
      const entite = entiteMap.get(nomCourt);
      if (!entite) continue;

      const actuals = numericValue(row[colActuals]);
      const target  = numericValue(row[colTarget]);
      const date    = lastDayOfMonth(annee, mois);

      for (const [typeValeur, montant] of [['ACTUALS', actuals], ['TARGET', target]] as [string, number][]) {
        try {
          const existing = await prisma.faitPl.findUnique({
            where: {
              date_entiteId_lignePlId_typeValeur_typePeriode: {
                date, entiteId: entite.id, lignePlId, typeValeur, typePeriode: 'YTD',
              },
            },
          });
          if (existing) {
            await prisma.faitPl.update({
              where: { id: existing.id },
              data: { montant, sourceOnglet: 'BU FF P&L' },
            });
            result.updated++;
          } else {
            await prisma.faitPl.create({
              data: { date, annee, mois, entiteId: entite.id, bu: 'FREIGHT_FORWARDING', lignePlId, typeValeur, typePeriode: 'YTD', montant, sourceOnglet: 'BU FF P&L' },
            });
            result.created++;
          }
        } catch (e) {
          result.errors.push(`Erreur ${nomCourt} ${ligneName} ${typeValeur}: ${e}`);
        }
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'IMPORT',
      tableName: 'fait_pl',
      periode: `${annee}-${String(mois).padStart(2, '0')}`,
      details: { bu: 'FREIGHT_FORWARDING', ...result },
    },
  });

  return result;
}

// ── TEMPLATE UNIFIÉ : feuilles "PL" + "PL clients" — auto-détecte BU/entité ─
export async function importPlTemplate(
  buffer: Buffer,
  annee: number,
  moisParam: number,   // utilisé comme fallback si aucun mois détecté
  userId: number
): Promise<ImportResult & { detectedMonths: number[]; referenceMois: number; entiteId?: number; bu?: string; entiteNom?: string; annee?: number }> {
  const result: { created: number; updated: number; errors: string[]; detectedMonths: number[]; referenceMois: number; entiteId?: number; bu?: string; entiteNom?: string; annee?: number } =
    { created: 0, updated: 0, errors: [], detectedMonths: [], referenceMois: moisParam };
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // ── 1. Lire BU + entité depuis la feuille "PL clients" ───────────────────
  const clientsSheet = wb.Sheets['PL clients'] || wb.Sheets[wb.SheetNames[1]];
  if (!clientsSheet) { result.errors.push('Onglet "PL clients" introuvable'); return result; }
  const clientsData = XLSX.utils.sheet_to_json(clientsSheet, { header: 1, defval: null }) as unknown[][];

  const buRaw = String((clientsData[0] as unknown[])?.[0] ?? '').trim().toUpperCase();
  const entityRaw = String((clientsData[1] as unknown[])?.[0] ?? '').trim();

  const bu = BU_LABEL_MAP[buRaw] ?? null;
  if (!bu) {
    result.errors.push(`BU non reconnue : "${buRaw}". Attendu : "BU LOGISTIQUE", "BU PROCUREMENT", "BU FREIGHT FORWARDING"`);
    return result;
  }
  if (!entityRaw) { result.errors.push('Nom d\'entité vide (cellule A2 de "PL clients")'); return result; }

  const entite = await prisma.dimEntite.findFirst({
    where: {
      OR: [
        { nom: { equals: entityRaw, mode: 'insensitive' } },
        { nomCourt: { equals: entityRaw, mode: 'insensitive' } },
      ],
    },
    include: { bu: true },
  });
  if (!entite) { result.errors.push(`Entité "${entityRaw}" introuvable en base`); return result; }

  result.entiteId = entite.id;
  result.bu = bu;
  result.entiteNom = entite.nomCourt;

  const isCfa = entite.deviseSource === 'CFA';
  const ratio = entite.ratioBu ? Number(entite.ratioBu) : 1;
  const convert = (v: number): number => (isCfa ? cfaToEur(v) : v) * ratio;

  // ── 2. Charger dimLignePl — auto-créer les manquants ─────────────────────
  const lignesList = await prisma.dimLignePl.findMany();
  const ligneMap = new Map(lignesList.map(l => [l.nom, l.id]));

  for (const nom of Object.values(PL_ROW_MAP)) {
    if (!ligneMap.has(nom)) {
      const created = await prisma.dimLignePl.upsert({
        where: { nom },
        update: {},
        create: { nom, ordreAffichage: 100, type: 'CHARGE' },
      });
      ligneMap.set(nom, created.id);
    }
  }

  // ── 3. Traiter la feuille "PL" ────────────────────────────────────────────
  const plSheet = wb.Sheets['PL'] || wb.Sheets[wb.SheetNames[0]];
  if (!plSheet) { result.errors.push('Onglet "PL" introuvable'); return result; }
  const plData = XLSX.utils.sheet_to_json(plSheet, { header: 1, defval: null }) as unknown[][];

  // Detect header row — rows 1-2 may be empty in the template so SheetJS !ref starts at row 3,
  // making plData[0] = Excel row 3. PL_ROW_MAP indices assume !ref starts at row 1.
  let hdrIdx = -1;
  for (let i = 0; i < Math.min(plData.length, 6); i++) {
    const r = plData[i] as unknown[];
    if (String(r?.[0] ?? '').trim().toUpperCase() === 'POSTES') { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) { result.errors.push('En-tête "POSTES" introuvable dans la feuille PL'); return result; }
  const rowOffset = hdrIdx - 2; // PL_ROW_MAP assumes POSTES at idx 2; adjust if it's elsewhere

  // Auto-détection de l'année depuis la ligne POSTES col B, ex: "2026 Budget YTD"
  const hdrB3 = String((plData[hdrIdx] as unknown[])?.[1] ?? '');
  const yearMatch = hdrB3.match(/\b(20\d{2})\b/);
  const effectiveYear = yearMatch ? parseInt(yearMatch[1]) : annee;
  result.annee = effectiveYear;

  // Auto-détection : quels mois (cols C=m1 … N=m12) ont au moins une valeur non nulle ?
  const filledMonthsSet = new Set<number>();
  for (const [idxStr] of Object.entries(PL_ROW_MAP)) {
    const row = plData[parseInt(idxStr) + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    for (let m = 1; m <= 12; m++) {
      if (numericValue(row[m + 1]) !== 0) filledMonthsSet.add(m);
    }
  }
  const filledMonths = [...filledMonthsSet].sort((a, b) => a - b);
  const referenceMois = filledMonths.length > 0 ? Math.max(...filledMonths) : moisParam;
  result.detectedMonths = filledMonths;
  result.referenceMois  = referenceMois;

  for (const [idxStr, ligneName] of Object.entries(PL_ROW_MAP)) {
    const rowIdx = parseInt(idxStr) + rowOffset;
    const row = plData[rowIdx] as unknown[] | undefined;
    if (!row) continue;
    const lignePlId = ligneMap.get(ligneName);
    if (!lignePlId) { result.errors.push(`Ligne P&L "${ligneName}" introuvable`); continue; }

    // Ratio/%, staff-count rows must not be converted CFA→EUR
    const cvt = PL_NO_CONVERT_INDICES.has(parseInt(idxStr)) ? (v: number) => v : convert;

    // Actuals MTD : importer TOUS les mois détectés
    for (const m of filledMonths) {
      const actuals = cvt(numericValue(row[m + 1]));
      if (actuals === 0) continue;
      const date = lastDayOfMonth(effectiveYear, m);
      try {
        const existing = await prisma.faitPl.findUnique({
          where: { date_entiteId_lignePlId_typeValeur_typePeriode: { date, entiteId: entite.id, lignePlId, typeValeur: 'ACTUALS', typePeriode: 'MTD' } },
        });
        if (existing) {
          await prisma.faitPl.update({ where: { id: existing.id }, data: { montant: actuals, sourceOnglet: 'PL' } });
          result.updated++;
        } else {
          await prisma.faitPl.create({ data: { date, annee: effectiveYear, mois: m, entiteId: entite.id, bu, lignePlId, typeValeur: 'ACTUALS', typePeriode: 'MTD', montant: actuals, sourceOnglet: 'PL' } });
          result.created++;
        }
      } catch (e) { result.errors.push(`${ligneName} ACTUALS m${m}: ${e}`); }
    }

    // Budget YTD (col 1) → TARGET YTD, taggé sur le mois de référence auto-détecté
    const budgetYtd = cvt(numericValue(row[1]));
    if (budgetYtd !== 0) {
      const date = lastDayOfMonth(effectiveYear, referenceMois);
      try {
        const existing = await prisma.faitPl.findUnique({
          where: { date_entiteId_lignePlId_typeValeur_typePeriode: { date, entiteId: entite.id, lignePlId, typeValeur: 'TARGET', typePeriode: 'YTD' } },
        });
        if (existing) {
          await prisma.faitPl.update({ where: { id: existing.id }, data: { montant: budgetYtd, sourceOnglet: 'PL' } });
          result.updated++;
        } else {
          await prisma.faitPl.create({ data: { date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, lignePlId, typeValeur: 'TARGET', typePeriode: 'YTD', montant: budgetYtd, sourceOnglet: 'PL' } });
          result.created++;
        }
      } catch (e) { result.errors.push(`${ligneName} TARGET YTD: ${e}`); }
    }

    // YTD N-1 (col 15) → YTD_N1 YTD, taggé sur le mois de référence auto-détecté
    const ytdN1 = cvt(numericValue(row[15]));
    if (ytdN1 !== 0) {
      const date = lastDayOfMonth(effectiveYear, referenceMois);
      try {
        const existing = await prisma.faitPl.findUnique({
          where: { date_entiteId_lignePlId_typeValeur_typePeriode: { date, entiteId: entite.id, lignePlId, typeValeur: 'YTD_N1', typePeriode: 'YTD' } },
        });
        if (existing) {
          await prisma.faitPl.update({ where: { id: existing.id }, data: { montant: ytdN1, sourceOnglet: 'PL' } });
          result.updated++;
        } else {
          await prisma.faitPl.create({ data: { date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, lignePlId, typeValeur: 'YTD_N1', typePeriode: 'YTD', montant: ytdN1, sourceOnglet: 'PL' } });
          result.created++;
        }
      } catch (e) { result.errors.push(`${ligneName} YTD_N1: ${e}`); }
    }
  }

  // ── 4. Traiter la feuille "PL clients" ───────────────────────────────────
  // Supprimer les données existantes pour cet entité/période avant réinsertion
  await prisma.faitRevenusClients.deleteMany({ where: { entiteId: entite.id, annee: effectiveYear, mois: referenceMois } });

  const clientRows: Array<{
    date: Date; annee: number; mois: number; entiteId: number; bu: string;
    clientNom: string; lignePl: string; typeValeur: string;
    montant: number; marginRate: number | null; sharePct: number | null; sourceOnglet: string;
  }> = [];

  // Structure : R8+ contient les lignes REVENUE/MARGIN par client
  // Col 0=TYPE, 1=CLIENT, 2=MTD actuals(K€), 3=YTD actuals(K€), 4=Margin rate YTD,
  //       5=Share YTD, 6=Budget YTD(K€), 7=Budget margin rate, 8=Budget share
  const safeRate = (v: number): number | null => (isFinite(v) && Math.abs(v) <= 99.9999) ? v : null;

  for (let i = 7; i < clientsData.length; i++) {
    const row = clientsData[i] as unknown[];
    if (!row || !row[0]) continue;
    const type = String(row[0]).trim().toUpperCase();
    const clientNom = String(row[1] ?? '').trim();
    if ((type !== 'REVENUE' && type !== 'MARGIN') || !clientNom || clientNom.toUpperCase() === 'TOTAL') continue;

    const lignePl = type === 'REVENUE' ? 'Revenue' : 'Gross Margin';
    const mtd   = numericValue(row[2]) * 1000; // K€ → €
    const ytd   = numericValue(row[3]) * 1000;
    const tgt   = numericValue(row[6]) * 1000;
    const mrYtd = type === 'MARGIN' ? safeRate(numericValue(row[4])) : null;
    const shYtd = safeRate(numericValue(row[5]));
    const mrTgt = type === 'MARGIN' ? safeRate(numericValue(row[7])) : null;
    const shTgt = safeRate(numericValue(row[8]));
    const date  = lastDayOfMonth(effectiveYear, referenceMois);

    if (ytd !== 0)  clientRows.push({ date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, clientNom, lignePl, typeValeur: 'ACTUALS',     montant: ytd,  marginRate: mrYtd, sharePct: shYtd, sourceOnglet: 'PL clients' });
    if (tgt !== 0)  clientRows.push({ date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, clientNom, lignePl, typeValeur: 'TARGET',      montant: tgt,  marginRate: mrTgt, sharePct: shTgt, sourceOnglet: 'PL clients' });
    if (mtd !== 0)  clientRows.push({ date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, clientNom, lignePl, typeValeur: 'ACTUALS_MTD', montant: mtd,  marginRate: null,  sharePct: null,  sourceOnglet: 'PL clients' });
  }

  let clientsCreated = 0;
  if (clientRows.length > 0) {
    await prisma.faitRevenusClients.createMany({ data: clientRows });
    clientsCreated = clientRows.length;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'IMPORT',
      tableName: 'fait_pl',
      entiteId: entite.id,
      periode: `${effectiveYear}-${String(referenceMois).padStart(2, '0')}`,
      details: { bu, entite: entite.nomCourt, annee: effectiveYear, detectedMonths: filledMonths, referenceMois, plCreated: result.created, plUpdated: result.updated, clientsCreated, errors: result.errors.length },
    },
  });

  result.created += clientsCreated;
  return result;
}

// ── PREVIEW : analyse sans écriture DB ───────────────────────────────────────
// All main P&L rows (indices ≤ 32)
const PREVIEW_MAIN_ROWS    = [4,5,6,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32];
// Stats / ratio rows (indices 33-44, template rows 34-45)
const PREVIEW_STATS_ROWS   = [33,34,35,36,37,38,39,40,41,42,43,44];
// Overhead detail rows (indices 47-69)
const PREVIEW_OVERHEAD_ROWS = [47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69];

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

function buildPreviewLine(row: unknown[], filledMonths: number[], convert: (v: number) => number): { budget: number; months: Record<number, number>; ytdN1: number } {
  const months: Record<number, number> = {};
  for (const m of filledMonths) months[m] = convert(numericValue((row as unknown[])[m + 1]));
  return { budget: convert(numericValue((row as unknown[])[1])), months, ytdN1: convert(numericValue((row as unknown[])[15])) };
}

export async function previewPlTemplate(buffer: Buffer, fallbackAnnee: number): Promise<PreviewResult> {
  const result: PreviewResult = { errors: [], lines: [], statsLines: [], overheadLines: [], clientLines: [] };
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Read BU + entity from "PL clients"
  const clientsSheet = wb.Sheets['PL clients'] || wb.Sheets[wb.SheetNames[1]];
  if (!clientsSheet) { result.errors.push('Onglet "PL clients" introuvable'); return result; }
  const clientsData = XLSX.utils.sheet_to_json(clientsSheet, { header: 1, defval: null }) as unknown[][];

  const buRaw = String((clientsData[0] as unknown[])?.[0] ?? '').trim().toUpperCase();
  const entityRaw = String((clientsData[1] as unknown[])?.[0] ?? '').trim();

  const bu = BU_LABEL_MAP[buRaw] ?? null;
  if (!bu) { result.errors.push(`BU non reconnue : "${buRaw}"`); return result; }
  if (!entityRaw) { result.errors.push('Nom d\'entité vide (cellule A2 de "PL clients")'); return result; }

  const entite = await prisma.dimEntite.findFirst({
    where: { OR: [{ nom: { equals: entityRaw, mode: 'insensitive' } }, { nomCourt: { equals: entityRaw, mode: 'insensitive' } }] },
  });
  if (!entite) { result.errors.push(`Entité "${entityRaw}" introuvable`); return result; }

  result.bu = bu;
  result.entiteNom = entite.nomCourt;

  const isCfa = entite.deviseSource === 'CFA';
  const ratio = entite.ratioBu ? Number(entite.ratioBu) : 1;
  const convert = (v: number): number => (isCfa ? cfaToEur(v) : v) * ratio;
  result.isCfa = isCfa;

  // Read PL sheet
  const plSheet = wb.Sheets['PL'] || wb.Sheets[wb.SheetNames[0]];
  if (!plSheet) { result.errors.push('Onglet "PL" introuvable'); return result; }
  const plData = XLSX.utils.sheet_to_json(plSheet, { header: 1, defval: null }) as unknown[][];

  let hdrIdx = -1;
  for (let i = 0; i < Math.min(plData.length, 6); i++) {
    const r = plData[i] as unknown[];
    if (String(r?.[0] ?? '').trim().toUpperCase() === 'POSTES') { hdrIdx = i; break; }
  }
  if (hdrIdx === -1) { result.errors.push('En-tête "POSTES" introuvable'); return result; }
  const rowOffset = hdrIdx - 2;

  const hdrB3 = String((plData[hdrIdx] as unknown[])?.[1] ?? '');
  const yearMatch = hdrB3.match(/\b(20\d{2})\b/);
  result.annee = yearMatch ? parseInt(yearMatch[1]) : fallbackAnnee;

  // Detect filled months
  const filledMonthsSet = new Set<number>();
  for (const [idxStr] of Object.entries(PL_ROW_MAP)) {
    const row = plData[parseInt(idxStr) + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    for (let m = 1; m <= 12; m++) {
      if (numericValue(row[m + 1]) !== 0) filledMonthsSet.add(m);
    }
  }
  const filledMonths = [...filledMonthsSet].sort((a, b) => a - b);
  result.detectedMonths = filledMonths;
  result.referenceMois = filledMonths.length > 0 ? Math.max(...filledMonths) : 1;

  // Build ALL main P&L lines
  for (const rowIdxBase of PREVIEW_MAIN_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    result.lines.push({ nom, ...buildPreviewLine(row, filledMonths, convert) });
  }

  // Build stats / ratio lines (no CFA conversion for dimensionless rows)
  const identity = (v: number) => v;
  for (const rowIdxBase of PREVIEW_STATS_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    const cvt = PL_NO_CONVERT_INDICES.has(rowIdxBase) ? identity : convert;
    result.statsLines.push({ nom, ...buildPreviewLine(row, filledMonths, cvt) });
  }

  // Build overhead detail lines
  for (const rowIdxBase of PREVIEW_OVERHEAD_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    result.overheadLines.push({ nom, ...buildPreviewLine(row, filledMonths, convert) });
  }

  // Build PL clients preview (rows 8+ of the PL clients sheet)
  const safeRate = (v: number): number | null => (isFinite(v) && Math.abs(v) <= 9.9999) ? v : null;
  for (let i = 7; i < clientsData.length; i++) {
    const row = clientsData[i] as unknown[];
    if (!row || !row[0]) continue;
    const type = String(row[0]).trim().toUpperCase();
    const clientNom = String(row[1] ?? '').trim();
    if ((type !== 'REVENUE' && type !== 'MARGIN') || !clientNom || clientNom.toUpperCase() === 'TOTAL') continue;
    result.clientLines.push({
      clientNom,
      type: type as 'REVENUE' | 'MARGIN',
      mtd:        numericValue(row[2]) * 1000,
      ytd:        numericValue(row[3]) * 1000,
      budget:     numericValue(row[6]) * 1000,
      marginRate: type === 'MARGIN' ? safeRate(numericValue(row[4])) : null,
      share:      safeRate(numericValue(row[5])),
    });
  }

  return result;
}

// ── LOGISTICS: onglets entité (CSTT, AM, AFR CI...) en CFA ──────────────────
export async function importLogisticsEntite(
  buffer: Buffer,
  annee: number,
  mois: number,
  nomCourt: string,
  userId: number
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, errors: [] };
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[nomCourt] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { result.errors.push(`Onglet ${nomCourt} introuvable`); return result; }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];

  // Colonnes selon CDC: B=Budget YTD, C=Jan, D=Fév, ... (col 2=Jan, col 3=Fév...)
  // Lignes: 5=Revenue, 7=GM, 20=EBITDA, 22=Op.Inc., 31=Net Earnings
  const ligneRowMap: Record<number, string> = {
    4: 'Revenue',     // ligne 5 (0-indexed: 4)
    6: 'Gross Margin',
    19: 'EBITDA',
    21: 'Operating Income',
    30: 'Net Earnings',
  };

  const entite = await prisma.dimEntite.findUnique({ where: { nomCourt }, include: { bu: true } });
  if (!entite) { result.errors.push(`Entité ${nomCourt} introuvable`); return result; }

  const isCfa = entite.deviseSource === 'CFA';
  const ratio = entite.ratioBu ? Number(entite.ratioBu) : 1;

  const lignes = await prisma.dimLignePl.findMany();
  const ligneMap = new Map(lignes.map(l => [l.nom, l.id]));

  for (const [rowIdx, ligneName] of Object.entries(ligneRowMap)) {
    const row = data[parseInt(rowIdx)];
    if (!row) continue;
    const lignePlId = ligneMap.get(ligneName);
    if (!lignePlId) continue;

    // Budget annuel (colonne B = index 1)
    const budgetAnnuel = numericValue(row[1]);
    const budgetYtd = budgetAnnuel * (mois / 12);

    // Actuals MTD (colonne correspondant au mois: Jan=col C=2, Fév=3, Mar=4...)
    const colMtd = mois + 1; // col C=2 pour Jan=1
    const actualsMtd = numericValue(row[colMtd]);

    // YTD N-1 (colonne P = index 15)
    const ytdN1 = numericValue(row[15]);

    // Conversion CFA → EUR si nécessaire
    const convert = (v: number) => {
      let val = v;
      if (isCfa) val = cfaToEur(val);
      return val * ratio;
    };

    const date = lastDayOfMonth(annee, mois);

    const entries: Array<{ typeValeur: string; typePeriode: string; montant: number }> = [
      { typeValeur: 'ACTUALS', typePeriode: 'MTD', montant: convert(actualsMtd) },
      { typeValeur: 'TARGET', typePeriode: 'YTD', montant: convert(budgetYtd) },
      { typeValeur: 'YTD_N1', typePeriode: 'YTD', montant: convert(ytdN1) },
    ];

    for (const entry of entries) {
      try {
        const existing = await prisma.faitPl.findUnique({
          where: {
            date_entiteId_lignePlId_typeValeur_typePeriode: {
              date, entiteId: entite.id, lignePlId, typeValeur: entry.typeValeur, typePeriode: entry.typePeriode,
            },
          },
        });
        if (existing) {
          await prisma.faitPl.update({ where: { id: existing.id }, data: { montant: entry.montant, sourceOnglet: nomCourt } });
          result.updated++;
        } else {
          await prisma.faitPl.create({
            data: { date, annee, mois, entiteId: entite.id, bu: 'LOGISTICS', lignePlId, typeValeur: entry.typeValeur, typePeriode: entry.typePeriode, montant: entry.montant, sourceOnglet: nomCourt },
          });
          result.created++;
        }
      } catch (e) {
        result.errors.push(`${nomCourt} ${ligneName} ${entry.typeValeur}: ${e}`);
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'IMPORT',
      tableName: 'fait_pl',
      entiteId: entite.id,
      periode: `${annee}-${String(mois).padStart(2, '0')}`,
      details: { bu: 'LOGISTICS', nomCourt, isCfa, ...result },
    },
  });

  return result;
}
