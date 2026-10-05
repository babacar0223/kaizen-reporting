import { Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { resolveEntiteIds, groupKeyOf } from '../lib/entiteGroups';

const KEY_LINES = [
  'Revenue', 'Cost of Sales', 'Gross Margin', 'Overheads',
  'Salaries and personnel cost', 'Travels, Hotels & Missions',
  'Other expenses/revenues', 'Operating Income before M.Fees',
  'Management Fees', 'EBITDA', 'Operating Income', 'Net Earnings',
];

// Lignes "stock" (photo à un instant donné, ex: effectif) : la valeur du mois le plus
// récent doit être retenue, pas la somme des mois — contrairement aux lignes de flux (Revenue, etc.)
// Le total doit cependant rester la somme de toutes les entités (chacune à SON propre dernier mois
// rapporté, pas le dernier mois rencontré dans le flux global trié — voir stockPerEntityYtd ci-dessous).
const STOCK_LINES = new Set(['Staff Number']);

// Lignes "taux / ratio par employé" : une moyenne a du sens, jamais une somme. Un taux de TVA ou
// d'impôt répété à l'identique chaque mois (ou chez plusieurs entités) multiplierait artificiellement
// le résultat par le nombre de mois/entités si on le sommait comme une ligne de flux.
const RATE_LINES = new Set(['Nominal Income Tax Rate (%)', 'Average VAT Rate (%)', 'Gross Margin per Staff', 'Operating Cost per Staff']);

// GET /api/stats/:bu/:annee/:mois?entiteId=X
export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const entiteId = req.query.entiteId ? parseInt(req.query.entiteId as string) : undefined;
  const user = req.user!;
  const isViewer = user.role === 'VIEWER';

  const isRestricted = isViewer && user.entitesAccess.length > 0;
  // Un VIEWER ne peut jamais élargir son périmètre via le paramètre entiteId.
  if (isRestricted && entiteId && !user.entitesAccess.includes(entiteId)) {
    res.status(403).json({ message: 'Access to this entity is not allowed' });
    return;
  }
  const entityRestriction = isRestricted ? { entiteId: { in: user.entitesAccess } } : {};
  const entiteFilter = entiteId ? { entiteId: { in: resolveEntiteIds(entiteId) } } : entityRestriction;

  // NOT exclut les lignes typeValeur='ACTUALS' + typePeriode='YTD' que l'ancien import BU
  // Procurement/Freight Forwarding écrit pour un usage différent — sans cette exclusion elles se
  // mélangeraient (même clé ligne|ACTUALS) aux vraies valeurs mensuelles dans la boucle ci-dessous.
  const rows = await prisma.faitPl.findMany({
    where: { bu, annee: year, mois: { lte: month }, NOT: { typeValeur: 'ACTUALS', typePeriode: 'YTD' }, ...entiteFilter },
    include: { lignePl: true, entite: true },
    orderBy: [{ mois: 'desc' }, { lignePl: { ordreAffichage: 'asc' } }],
  });

  const monthlyMap: Record<number, Record<string, Record<string, number>>> = {};
  for (let m = 1; m <= month; m++) monthlyMap[m] = {};
  const ytd: Record<string, Record<string, number>> = {};

  const ytdSeenMonthly = new Set<string>();
  const ytdSeenTotal = new Set<string>();
  // YTD_N1 (2025, colonne B) est saisi à l'identique dans chaque entité fille d'un groupe
  // consolidé (Local + International Procurement) : ne compter qu'une fois par groupe.
  const n1SeenMonthly = new Set<string>();
  const n1SeenTotal = new Set<string>();

  // RATE_LINES : somme accumulée + nombre de points contribuant (YTD total et par mois), pour
  // diviser en moyenne une fois la boucle terminée.
  const rateCountYtd = new Map<string, number>();     // clé: ligne|type
  const rateCountMonthly = new Map<string, number>(); // clé: mois|ligne|type

  // STOCK_LINES : dernière valeur PAR ENTITÉ (rows triées mois desc -> 1re rencontre = son mois le
  // plus récent), sommée entre entités seulement à la fin — sinon une entité qui n'a pas encore
  // rapporté le mois le plus récent de tout le périmètre perdrait entièrement sa contribution.
  const stockPerEntityYtd = new Map<string, number>(); // clé: entiteId|ligne|type
  const stockSeenEntityYtd = new Set<string>();

  for (const row of rows) {
    const ln = row.lignePl.nom;
    const tv = row.typeValeur;
    const val = Number(row.montant);
    const m = row.mois;

    if (row.typePeriode === 'YTD') {
      const mKey = `${row.entiteId}|${ln}|${tv}|${m}`;
      const tKey = `${row.entiteId}|${ln}|${tv}`;
      if (ytdSeenMonthly.has(mKey)) continue;
      ytdSeenMonthly.add(mKey);
      if (tv === 'YTD_N1') {
        const gmKey = `${ln}|${tv}|${m}|${groupKeyOf(row.entiteId)}`;
        if (n1SeenMonthly.has(gmKey)) continue;
        n1SeenMonthly.add(gmKey);
      }
      if (!monthlyMap[m][ln]) monthlyMap[m][ln] = {};
      monthlyMap[m][ln][tv] = (monthlyMap[m][ln][tv] || 0) + val;
      if (!ytdSeenTotal.has(tKey)) {
        ytdSeenTotal.add(tKey);
        if (tv === 'YTD_N1') {
          const gtKey = `${ln}|${tv}|${groupKeyOf(row.entiteId)}`;
          if (n1SeenTotal.has(gtKey)) continue;
          n1SeenTotal.add(gtKey);
        }
        if (!ytd[ln]) ytd[ln] = {};
        ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
        if (RATE_LINES.has(ln)) {
          const key = `${ln}|${tv}`;
          rateCountYtd.set(key, (rateCountYtd.get(key) || 0) + 1);
        }
      }
    } else {
      if (!monthlyMap[m][ln]) monthlyMap[m][ln] = {};
      monthlyMap[m][ln][tv] = (monthlyMap[m][ln][tv] || 0) + val;
      if (RATE_LINES.has(ln)) {
        const mKey = `${m}|${ln}|${tv}`;
        rateCountMonthly.set(mKey, (rateCountMonthly.get(mKey) || 0) + 1);
      }

      if (!ytd[ln]) ytd[ln] = {};
      if (STOCK_LINES.has(ln)) {
        const entKey = `${row.entiteId}|${ln}|${tv}`;
        if (!stockSeenEntityYtd.has(entKey)) {
          stockSeenEntityYtd.add(entKey);
          stockPerEntityYtd.set(entKey, val);
        }
        // mois plus ancien pour CETTE entité — ignoré (sémantique "stock")
      } else if (RATE_LINES.has(ln)) {
        ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
        const key = `${ln}|${tv}`;
        rateCountYtd.set(key, (rateCountYtd.get(key) || 0) + 1);
      } else {
        ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
      }
    }
  }

  // Finalisation STOCK_LINES : total = somme des dernières valeurs par entité.
  for (const [key, val] of stockPerEntityYtd) {
    const [, ln, tv] = key.split('|');
    if (!ytd[ln]) ytd[ln] = {};
    ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
  }
  // Finalisation RATE_LINES : moyenne = somme accumulée / nombre de points, YTD et par mois.
  for (const [key, count] of rateCountYtd) {
    const [ln, tv] = key.split('|');
    if (ytd[ln]?.[tv] !== undefined && count > 0) ytd[ln][tv] = ytd[ln][tv] / count;
  }
  for (const [key, count] of rateCountMonthly) {
    const [mStr, ln, tv] = key.split('|');
    const m = parseInt(mStr);
    if (monthlyMap[m]?.[ln]?.[tv] !== undefined && count > 0) monthlyMap[m][ln][tv] = monthlyMap[m][ln][tv] / count;
  }

  const entityMap: Record<number, { nom: string; kpis: Record<string, Record<string, number>> }> = {};
  const entityYtdSeen = new Set<string>();
  const stockLatestMoisEntity = new Map<string, number>();
  const rateCountEntity = new Map<string, number>(); // clé: entiteId|ligne|type
  if (!isViewer) {
    for (const row of rows) {
      const eid = row.entiteId;
      if (!entityMap[eid]) entityMap[eid] = { nom: row.entite.nomCourt, kpis: {} };
      const ln = row.lignePl.nom;
      const tv = row.typeValeur;
      if (row.typePeriode === 'YTD') {
        const key = `${eid}|${ln}|${tv}`;
        if (entityYtdSeen.has(key)) continue;
        entityYtdSeen.add(key);
      }
      if (!entityMap[eid].kpis[ln]) entityMap[eid].kpis[ln] = {};
      if (row.typePeriode !== 'YTD' && STOCK_LINES.has(ln)) {
        const key = `${eid}|${ln}|${tv}`;
        const latest = stockLatestMoisEntity.get(key);
        if (latest === undefined || row.mois > latest) {
          stockLatestMoisEntity.set(key, row.mois);
          entityMap[eid].kpis[ln][tv] = Number(row.montant);
        } else if (row.mois === latest) {
          entityMap[eid].kpis[ln][tv] = (entityMap[eid].kpis[ln][tv] || 0) + Number(row.montant);
        }
      } else if (row.typePeriode !== 'YTD' && RATE_LINES.has(ln)) {
        entityMap[eid].kpis[ln][tv] = (entityMap[eid].kpis[ln][tv] || 0) + Number(row.montant);
        const key = `${eid}|${ln}|${tv}`;
        rateCountEntity.set(key, (rateCountEntity.get(key) || 0) + 1);
      } else {
        entityMap[eid].kpis[ln][tv] = (entityMap[eid].kpis[ln][tv] || 0) + Number(row.montant);
      }
    }
    for (const [key, count] of rateCountEntity) {
      const [eidStr, ln, tv] = key.split('|');
      const eid = parseInt(eidStr);
      if (entityMap[eid]?.kpis[ln]?.[tv] !== undefined && count > 0) {
        entityMap[eid].kpis[ln][tv] = entityMap[eid].kpis[ln][tv] / count;
      }
    }
  }

  res.json({
    bu, annee: year, mois: month,
    monthly: Object.entries(monthlyMap).map(([m, kpis]) => ({ mois: parseInt(m), kpis })),
    ytd,
    entities: Object.entries(entityMap).map(([id, v]) => ({ entiteId: parseInt(id), nom: v.nom, kpis: v.kpis })),
  });
}

// GET /api/admin/template/monthly
export async function downloadMonthlyTemplate(req: AuthRequest, res: Response): Promise<void> {
  const year = new Date().getFullYear();

  // Fetch entities for dropdown lists in "PL clients" sheet
  const allEntities = await prisma.dimEntite.findMany({
    where: { actif: true },
    orderBy: [{ bu: { nomCourt: 'asc' } }, { nomCourt: 'asc' }],
  });
  const wb = new ExcelJS.Workbook();
  const MFR = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const colLetter = (c: number) => String.fromCharCode(64 + c); // 1→A, 2→B …

  // Col mapping (1-based) — le YTD N-1 (prior year) est en 2e position, juste après le libellé :
  //   1=A libellé · 2=B YTD N-1 · 3=C Budget YTD · 4-15=D-O mois janv..déc · 16=P TOTAL
  const cYtdN1  = 2;
  const cBudget = 3;
  const cM      = (m0: number) => 4 + m0; // m0 = index de mois 0-based (0=janv)
  const cTotal  = 16;
  const monthsSum = (r: number) => `SUM(${colLetter(cM(0))}${r}:${colLetter(cM(11))}${r})`;

  const pctFmt = '0.0%';
  const numFmt = '#,##0';   // milliers, sans décimales — appliqué par défaut aux colonnes de montants

  // ── Sheet "PL" ─────────────────────────────────────────────────────────────
  const wsPl = wb.addWorksheet('PL');
  wsPl.columns = [
    { width: 68 },                                          // A libellé — pas de format
    { width: 14, style: { numFmt } },                       // B YTD N-1
    { width: 16, style: { numFmt } },                       // C Budget YTD
    ...Array(12).fill(null).map(() => ({ width: 12, style: { numFmt } })), // D-O mois
    { width: 14, style: { numFmt } },                       // P TOTAL
  ];

  const boldFont: Partial<ExcelJS.Font> = { bold: true, name: 'Calibri', size: 10 };
  const regFont:  Partial<ExcelJS.Font> = { bold: false, name: 'Calibri', size: 10 };

  // Set label in col A
  function lbl(r: number, text: string, bold = false) {
    const c = wsPl.getRow(r).getCell(1);
    c.value = text;
    c.font = bold ? boldFont : regFont;
  }

  // Set a single cell formula (col is 1-based)
  function setF(r: number, col: number, formula: string, bold = false, fmt?: string) {
    const c = wsPl.getRow(r).getCell(col);
    c.value = { formula };
    c.font = bold ? boldFont : regFont;
    if (fmt) c.numFmt = fmt;
  }

  // Apply formula across Budget + months + YTD N-1; TOTAL = SUM(months)
  function fxRow(r: number, fn: (cl: string) => string, bold = false, pct = false) {
    const fmt = pct ? pctFmt : undefined;
    setF(r, cBudget, fn(colLetter(cBudget)), bold, fmt);
    for (let m = 0; m < 12; m++) setF(r, cM(m), fn(colLetter(cM(m))), bold, fmt);
    setF(r, cTotal, monthsSum(r), bold, pct ? pctFmt : undefined);
    setF(r, cYtdN1, fn(colLetter(cYtdN1)), bold, fmt);
  }

  // TOTAL column only (SUM of months for input rows)
  function sumO(r: number) {
    wsPl.getRow(r).getCell(cTotal).value = { formula: monthsSum(r) };
  }

  // Ratio formula: numRow / denRow across all data cols (% format)
  function fxRatioPct(r: number, numRow: number, denRow: number) {
    const bud = colLetter(cBudget), tot = colLetter(cTotal), pyr = colLetter(cYtdN1);
    setF(r, cBudget, `IF(${bud}${denRow}<>0,${bud}${numRow}/${bud}${denRow},0)`, false, pctFmt);
    for (let m = 0; m < 12; m++) {
      const cl = colLetter(cM(m));
      setF(r, cM(m), `IF(${cl}${denRow}<>0,${cl}${numRow}/${cl}${denRow},0)`, false, pctFmt);
    }
    setF(r, cTotal, `IF(${tot}${denRow}<>0,${tot}${numRow}/${tot}${denRow},0)`, false, pctFmt);
    setF(r, cYtdN1, `IF(${pyr}${denRow}<>0,${pyr}${numRow}/${pyr}${denRow},0)`, false, pctFmt);
  }

  // Per-person formula: valueRow / staffRow (no %)
  function fxPerPerson(r: number, valueRow: number, staffRow: number) {
    const bud = colLetter(cBudget), tot = colLetter(cTotal), pyr = colLetter(cYtdN1);
    setF(r, cBudget, `IF(${bud}${staffRow}<>0,${bud}${valueRow}/${bud}${staffRow},0)`);
    for (let m = 0; m < 12; m++) {
      const cl = colLetter(cM(m));
      setF(r, cM(m), `IF(${cl}${staffRow}<>0,${cl}${valueRow}/${cl}${staffRow},0)`);
    }
    setF(r, cTotal, `IF(${tot}${staffRow}<>0,${tot}${valueRow}/${tot}${staffRow},0)`);
    setF(r, cYtdN1, `IF(${pyr}${staffRow}<>0,${pyr}${valueRow}/${pyr}${staffRow},0)`);
  }

  // ── Rows 1-2: taux de change personnalisés (optionnels) ─────────────────────
  // Le taux réel diffère souvent entre les mois en cours (Actuals), le budget saisi plus tôt dans
  // l'année, et les actuals {year-1} (YTD N-1) — chacun converti au taux en vigueur à son époque.
  // Colonnes alignées sur les colonnes de données correspondantes (B=N-1, C=Budget, D=1er mois
  // représentant Actuals). Case laissée à blanc/1 ⇒ le taux de conversion par défaut de l'entité
  // (Réglages → Entités) s'applique, comme avant.
  const rateLbl = wsPl.getRow(1);
  rateLbl.getCell(1).value = 'Conv. rate → EUR (blank = entity default)';
  rateLbl.getCell(1).font = { ...regFont, italic: true };
  rateLbl.getCell(cYtdN1).value = 'N-1';
  rateLbl.getCell(cBudget).value = 'Budget';
  rateLbl.getCell(cM(0)).value = 'Actuals';
  [cYtdN1, cBudget, cM(0)].forEach(c => { rateLbl.getCell(c).font = boldFont; rateLbl.getCell(c).alignment = { horizontal: 'center' }; });

  const rateVal = wsPl.getRow(2);
  [cYtdN1, cBudget, cM(0)].forEach(c => {
    const cell = rateVal.getCell(c);
    cell.numFmt = '0.0000';
    cell.font = regFont;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E6' } };
  });

  // ── Header row R3 ──────────────────────────────────────────────────────────
  const hdr = wsPl.getRow(3);
  hdr.values = ['POSTES', `YTD ${year-1}`, `${year} Budget YTD`, ...MFR, `TOTAL ${year}`];
  hdr.font = boldFont;
  hdr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
  hdr.getCell(cYtdN1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

  // ── Labels — exact names matching the platform (pl-lines.ts) ────────────────
  lbl(5,  'Revenue');
  lbl(6,  'Cost of Sales');
  lbl(7,  'Gross Margin',                        true);
  lbl(8,  '% Gross Margin',                      true);
  lbl(9,  'Overheads',                           true);
  lbl(10, 'Other Operating Expenses');
  lbl(11, 'Bad Debt Provision');
  lbl(12, 'Provisions for Risks');
  lbl(13, 'Other Operating Charges',             true);
  lbl(14, 'Proceeds from Asset Sales');
  lbl(15, 'Bonus/Malus Disbursements');
  lbl(16, 'Other Operating Revenues');
  lbl(17, 'Reversal Bad Debt Provision');
  lbl(18, 'Reversal Provisions for Risks');
  lbl(19, 'Other Current Revenues',              true);
  lbl(20, 'EBITDA',                              true);
  lbl(21, 'Depreciation');
  lbl(22, 'Operating Income',                    true);
  lbl(23, 'Financial Expenses');
  lbl(24, 'Financial Income');
  lbl(25, 'Net Cost of Debt',                    true);
  lbl(26, 'Other Financial Expenses');
  lbl(27, 'Other Financial Revenues');
  lbl(28, 'Other Financial Gain & Loss',         true);
  lbl(29, 'Profit Before Tax',                   true);
  lbl(30, 'Income Tax');
  lbl(31, 'Net Earnings',                        true);
  lbl(32, 'Cash Flow',                           true);
  lbl(33, 'Working Days');

  // R34-R45: ratios section
  lbl(34, 'Income Tax / Profit Before Tax (%)');
  lbl(35, 'Net Earnings / Gross Margin (%)');
  lbl(36, 'Overheads / Gross Margin (%)');
  lbl(37, 'EBITDA / Gross Margin (%)');
  lbl(38, 'Depreciation / Gross Margin (%)');
  lbl(39, 'Operating Income / Gross Margin (%)');
  lbl(40, 'Financial Expenses / Gross Margin (%)');
  lbl(41, 'Nominal Income Tax Rate (%) — obligatoire', true);
  lbl(42, 'Average VAT Rate (%) — obligatoire', true);
  lbl(43, 'Staff Number — obligatoire', true);
  lbl(44, 'Gross Margin per Staff');
  lbl(45, 'Operating Cost per Staff');

  lbl(46, 'Overhead Detail', true);

  lbl(48, 'Rent & Leasing');
  lbl(49, 'Fuel');
  lbl(50, 'Water & Electricity');
  lbl(51, 'Maintenance');
  lbl(52, 'Fees & Penalties');
  lbl(53, 'Taxes (non-corporate)');
  lbl(54, 'Salaries and personnel cost');
  lbl(55, 'Travels, Hotels & Missions');
  lbl(56, 'Staff Transport');
  lbl(57, 'Professional Fees');
  lbl(58, 'Temporary Staff');
  lbl(59, 'Insurance');
  lbl(60, 'Communications');
  lbl(61, 'Bank Charges');
  lbl(62, 'Office Supplies');
  lbl(63, 'Donations & Gifts');
  lbl(64, 'Professional Org. Contributions');
  lbl(65, 'Small Equipment');
  lbl(66, 'General Documentation');
  lbl(67, 'Seminars');
  lbl(68, 'Advertising');
  lbl(69, 'Other Overhead Charges');
  lbl(70, 'Management Fees');
  lbl(71, 'OVERHEADS',                           true);

  // ── P&L formulas ──────────────────────────────────────────────────────────
  // R7: Gross Margin = R5 + R6
  fxRow(7, cl => `${cl}5+${cl}6`, true);

  // R8: % Gross Margin = R7/R5  (TOTAL8 = IF ratio, not SUM)
  {
    const bud = colLetter(cBudget), tot = colLetter(cTotal), pyr = colLetter(cYtdN1);
    setF(8, cBudget, `IF(${bud}5<>0,${bud}7/${bud}5,0)`, true, pctFmt);
    for (let m = 0; m < 12; m++) {
      const cl = colLetter(cM(m));
      setF(8, cM(m), `IF(${cl}5<>0,${cl}7/${cl}5,0)`, true, pctFmt);
    }
    setF(8, cTotal, `IF(${tot}5<>0,${tot}7/${tot}5,0)`, true, pctFmt);
    setF(8, cYtdN1, `IF(${pyr}5<>0,${pyr}7/${pyr}5,0)`, true, pctFmt);
  }

  // R9: Frais généraux — reprend OVERHEADS (R71) en négatif (charge) sur Budget, mois & YTD N-1
  setF(9, cBudget, `-${colLetter(cBudget)}71`, true);
  for (let m = 0; m < 12; m++) {
    const cl = colLetter(cM(m));
    setF(9, cM(m), `-${cl}71`, true);
  }
  setF(9, cYtdN1, `-${colLetter(cYtdN1)}71`, true);
  setF(9, cTotal, monthsSum(9), true); // TOTAL9 = somme des mois (déjà négatifs)

  // R13: Autres Charges Courants = R9+R10+R11+R12
  fxRow(13, cl => `${cl}9+${cl}10+${cl}11+${cl}12`, true);

  // R19: Autres Produits Courants = R14+R15+R16+R17+R18
  fxRow(19, cl => `${cl}14+${cl}15+${cl}16+${cl}17+${cl}18`, true);

  // R20: EBITDA = R7+R13+R19
  fxRow(20, cl => `${cl}7+${cl}13+${cl}19`, true);

  // R22: Operating Income = R20+R21
  fxRow(22, cl => `${cl}20+${cl}21`, true);

  // R25: Net Cost of Debt = R23+R24
  fxRow(25, cl => `${cl}23+${cl}24`, true);

  // R28: Other Financial G&L = R26+R27
  fxRow(28, cl => `${cl}26+${cl}27`, true);

  // R29: PBT = R22+R25+R28
  fxRow(29, cl => `${cl}22+${cl}25+${cl}28`, true);

  // R31: Net Earnings = R29+R30
  fxRow(31, cl => `${cl}29+${cl}30`, true);

  // R32: Cash Flow = R31−R21
  fxRow(32, cl => `${cl}31-${cl}21`, true);

  // R71: OVERHEADS = SUM(R48:R70)
  fxRow(71, cl => `SUM(${cl}48:${cl}70)`, true);

  // sumO for pure input rows
  [5,6,10,11,12,14,15,16,17,18,21,23,24,26,27,30,33,
   41,42,43,
   48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70]
    .forEach(r => sumO(r));

  // R34-R40: ratio formulas (% of GM)
  fxRatioPct(34, 30, 29);  // Income Tax / PBT
  fxRatioPct(35, 31,  7);  // Net Earnings / GM
  fxRatioPct(36,  9,  7);  // General Expenses / GM (R9 = overhead total)
  fxRatioPct(37, 20,  7);  // EBITDA / GM
  fxRatioPct(38, 21,  7);  // Depreciation / GM (absolute)
  fxRatioPct(39, 22,  7);  // Operating Income / GM
  fxRatioPct(40, 23,  7);  // Financial Expenses / GM (absolute)

  // R41-R42: saisies manuelles de taux (%) — forcer le format % sur toute la ligne de données
  for (const r of [8, 34, 35, 36, 37, 38, 39, 40, 41, 42]) {
    for (let c = 2; c <= cTotal; c++) wsPl.getRow(r).getCell(c).numFmt = pctFmt;
  }
  // R43: staff count — O only (already handled by sumO above)

  // R44: Gross Margin per staff = R7 / R43
  fxPerPerson(44, 7, 43);
  // R45: Operating Cost per staff = R9 / R43
  fxPerPerson(45, 9, 43);

  // ── Sheet "PL clients" ─────────────────────────────────────────────────────
  // Colonnes (1-based) :
  //   1  A   Client                       [saisie]
  //   2-13 B..M  Ventes janv..déc         [saisie, K€]
  //   14 N   Ventes Total YTD             [formule SUM]
  //   15-26 O..Z COS janv..déc            [saisie, K€]
  //   27 AA  COS Total YTD                [formule SUM]
  //   28 AB  Marge brute YTD (GM YTD)     [formule = N-AA]
  //   29 AC  GM %                         [formule = AB/N]
  //   30 AD  Budget Annuel                [saisie, K€]
  //   31 AE  Budget YTD                   [formule = AD/12 × mois écoulés (F1)]
  //   32 AF  Réalisation %                [formule = N/AE]
  //   33 AG  Écart YTD                    [formule = N-AE]
  // L'import ne lit que A + Ventes + COS + Budget Annuel ; les colonnes calculées
  // sont un simple confort de saisie (la plateforme recalcule tout).
  const wsC = wb.addWorksheet('PL clients');
  const kFmt = '#,##0';
  const cL = (c: number): string => { // 1→A … 27→AA … 33→AG
    let s = ''; let n = c;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  wsC.columns = [
    { width: 30 },
    ...Array(12).fill(null).map(() => ({ width: 10, style: { numFmt: kFmt } })),  // B-M Ventes
    { width: 13, style: { numFmt: kFmt } },                                        // N Ventes YTD
    ...Array(12).fill(null).map(() => ({ width: 10, style: { numFmt: kFmt } })),  // O-Z COS
    { width: 13, style: { numFmt: kFmt } },                                        // AA COS YTD
    { width: 13, style: { numFmt: kFmt } },                                        // AB GM YTD
    { width: 9,  style: { numFmt: pctFmt } },                                       // AC GM %
    { width: 13, style: { numFmt: kFmt } },                                        // AD Budget Annuel
    { width: 13, style: { numFmt: kFmt } },                                        // AE Budget YTD
    { width: 9,  style: { numFmt: pctFmt } },                                       // AF Réal. %
    { width: 13, style: { numFmt: kFmt } },                                        // AG Écart YTD
  ];

  function cx(r: number, c: number, val: string | number | { formula: string } | null, bold = false, fmt?: string) {
    const cell = wsC.getRow(r).getCell(c);
    if (val !== null) cell.value = val as ExcelJS.CellValue;
    if (bold) cell.font = boldFont;
    if (fmt) cell.numFmt = fmt;
  }

  // A1 / A2 : dropdowns BU / Entité (ajoutés plus bas). Cellule de contrôle "Mois écoulés".
  cx(1, 1, null);
  cx(2, 1, null);
  cx(1, 3, 'Mois écoulés (dernier mois saisi) →', true);
  cx(1, 6, new Date().getMonth() + 1); // F1 : modifiable par le reporter
  wsC.getCell('F1').font = boldFont;
  wsC.getCell('A2').note = 'Montants en unité pleine (pas en milliers), dans la devise de l\'entité (Réglages → Entités). Conversion en EUR automatique à l\'import.';

  // R3 : libellés de section
  cx(3, 2,  'VENTES', true);
  cx(3, 15, 'COÛT DES VENTES / COS', true);
  cx(3, 28, 'MARGE BRUTE', true);
  cx(3, 30, 'BUDGET & RÉALISATION', true);

  // R4 : en-tête des colonnes
  const clientHdr = wsC.getRow(4);
  clientHdr.getCell(1).value = 'Client';
  for (let m = 0; m < 12; m++) {
    clientHdr.getCell(2 + m).value = MFR[m];   // Ventes janv..déc
    clientHdr.getCell(15 + m).value = MFR[m];  // COS janv..déc
  }
  clientHdr.getCell(14).value = 'Total YTD';
  clientHdr.getCell(27).value = 'Total YTD';
  clientHdr.getCell(28).value = 'GM YTD';
  clientHdr.getCell(29).value = 'GM %';
  clientHdr.getCell(30).value = `Budget ${year}`;
  clientHdr.getCell(31).value = 'Budget YTD';
  clientHdr.getCell(32).value = 'Réal. %';
  clientHdr.getCell(33).value = 'Écart YTD';
  clientHdr.font = boldFont;

  const firstClientRow = 5;
  const lastClientRow = 204;   // ~200 lignes — insérez au-dessus de TOTAL si besoin
  const totalRow = lastClientRow + 1;

  // Colonnes calculées, pré-remplies sur toutes les lignes client.
  for (let r = firstClientRow; r <= lastClientRow; r++) {
    cx(r, 14, { formula: `SUM(B${r}:M${r})` });                                  // Ventes YTD
    cx(r, 27, { formula: `SUM(O${r}:Z${r})` });                                  // COS YTD
    cx(r, 28, { formula: `N${r}-AA${r}` });                                      // GM YTD
    cx(r, 29, { formula: `IF(N${r}<>0,AB${r}/N${r},0)` }, false, pctFmt);        // GM %
    cx(r, 31, { formula: `IF($F$1="",0,AD${r}/12*$F$1)` });                      // Budget YTD
    cx(r, 32, { formula: `IF(AE${r}<>0,N${r}/AE${r},0)` }, false, pctFmt);       // Réal. %
    cx(r, 33, { formula: `N${r}-AE${r}` });                                      // Écart YTD
  }

  // Ligne TOTAL
  wsC.getRow(totalRow).getCell(1).value = 'TOTAL';
  wsC.getRow(totalRow).getCell(1).font = boldFont;
  wsC.getRow(totalRow).getCell(1).note = 'Insérez des lignes au-dessus de cette ligne pour ajouter des clients (nombre illimité). Ne rien saisir sous TOTAL.';
  for (const c of [...Array(12).keys()].map(i => 2 + i)     // B-M Ventes
    .concat([14])                                            // N Ventes YTD
    .concat([...Array(12).keys()].map(i => 15 + i))          // O-Z COS
    .concat([27, 28, 30, 31, 33])) {                         // AA GM/COS YTD, AB GM YTD, AD Budget, AE Budget YTD, AG Écart
    cx(totalRow, c, { formula: `SUM(${cL(c)}${firstClientRow}:${cL(c)}${lastClientRow})` }, true, kFmt);
  }
  cx(totalRow, 29, { formula: `IF(N${totalRow}<>0,AB${totalRow}/N${totalRow},0)` }, true, pctFmt); // GM %
  cx(totalRow, 32, { formula: `IF(AE${totalRow}<>0,N${totalRow}/AE${totalRow},0)` }, true, pctFmt); // Réal. %

  // ── Hidden reference sheet "Listes" for dropdown validation ───────────────
  const wsL = wb.addWorksheet('Listes');
  wsL.state = 'hidden';

  const buOptions = ['BU LOGISTIQUE', 'BU PROCUREMENT', 'BU FREIGHT FORWARDING'];
  buOptions.forEach((bu, i) => { wsL.getRow(i + 1).getCell(1).value = bu; });
  allEntities.forEach((e, i) => { wsL.getRow(i + 1).getCell(2).value = e.nomCourt; });

  // ── Data validation dropdowns on A1 (BU) and A2 (Entité) ──────────────────
  wsC.getCell('A1').dataValidation = {
    type: 'list',
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: 'BU invalide',
    error: 'Sélectionner un BU dans la liste : BU LOGISTIQUE, BU PROCUREMENT, BU FREIGHT FORWARDING.',
    formulae: [`Listes!$A$1:$A$${buOptions.length}`],
  };

  wsC.getCell('A2').dataValidation = {
    type: 'list',
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: 'Entité invalide',
    error: "Sélectionner une entité dans la liste.",
    formulae: [`Listes!$B$1:$B$${allEntities.length || 1}`],
  };

  // ── Output ─────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="template_pl_${year}.xlsx"`);
  res.send(Buffer.from(buf as ArrayBuffer));
}
