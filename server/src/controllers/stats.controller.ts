import { Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const KEY_LINES = [
  'Revenue', 'Cost of Sales', 'Gross Margin', 'Overheads',
  'Salaries and personnel cost', 'Travels, Hotels & Missions',
  'Other expenses/revenues', 'Operating Income before M.Fees',
  'Management Fees', 'EBITDA', 'Operating Income', 'Net Earnings',
];

// GET /api/stats/:bu/:annee/:mois?entiteId=X
export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const bu = req.params.bu as string;
  const year = parseInt(req.params.annee as string);
  const month = parseInt(req.params.mois as string);
  const entiteId = req.query.entiteId ? parseInt(req.query.entiteId as string) : undefined;
  const user = req.user!;
  const isViewer = user.role === 'VIEWER';

  const entityRestriction = isViewer && user.entitesAccess.length > 0
    ? { entiteId: { in: user.entitesAccess } }
    : {};
  const entiteFilter = entiteId ? { entiteId } : entityRestriction;

  const rows = await prisma.faitPl.findMany({
    where: { bu, annee: year, mois: { lte: month }, ...entiteFilter },
    include: { lignePl: true, entite: true },
    orderBy: [{ mois: 'desc' }, { lignePl: { ordreAffichage: 'asc' } }],
  });

  const monthlyMap: Record<number, Record<string, Record<string, number>>> = {};
  for (let m = 1; m <= month; m++) monthlyMap[m] = {};
  const ytd: Record<string, Record<string, number>> = {};

  const ytdSeenMonthly = new Set<string>();
  const ytdSeenTotal = new Set<string>();

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
      if (!monthlyMap[m][ln]) monthlyMap[m][ln] = {};
      monthlyMap[m][ln][tv] = (monthlyMap[m][ln][tv] || 0) + val;
      if (!ytdSeenTotal.has(tKey)) {
        ytdSeenTotal.add(tKey);
        if (!ytd[ln]) ytd[ln] = {};
        ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
      }
    } else {
      if (!monthlyMap[m][ln]) monthlyMap[m][ln] = {};
      monthlyMap[m][ln][tv] = (monthlyMap[m][ln][tv] || 0) + val;
      if (!ytd[ln]) ytd[ln] = {};
      ytd[ln][tv] = (ytd[ln][tv] || 0) + val;
    }
  }

  const entityMap: Record<number, { nom: string; kpis: Record<string, Record<string, number>> }> = {};
  const entityYtdSeen = new Set<string>();
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
      entityMap[eid].kpis[ln][tv] = (entityMap[eid].kpis[ln][tv] || 0) + Number(row.montant);
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
  // Col mapping (1-based): 1=A(label), 2=B(budget), 3-14=C-N(months), 15=O(total), 16=P(YTD N-1)
  const colLetter = (c: number) => String.fromCharCode(64 + c); // 1→A, 2→B …

  // ── Sheet "PL" ─────────────────────────────────────────────────────────────
  const wsPl = wb.addWorksheet('PL');
  wsPl.columns = [
    { width: 68 }, { width: 16 },
    ...Array(12).fill(null).map(() => ({ width: 12 })),
    { width: 14 }, { width: 14 },
  ];

  const boldFont: Partial<ExcelJS.Font> = { bold: true, name: 'Calibri', size: 10 };
  const regFont:  Partial<ExcelJS.Font> = { bold: false, name: 'Calibri', size: 10 };
  const pctFmt = '0.0%';
  const numFmt = '#,##0';

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

  // Apply formula across B + C-N + P; O = SUM(C:N)
  function fxRow(r: number, fn: (cl: string) => string, bold = false, pct = false) {
    const fmt = pct ? pctFmt : undefined;
    setF(r, 2, fn('B'), bold, fmt);
    for (let m = 0; m < 12; m++) setF(r, 3 + m, fn(colLetter(3 + m)), bold, fmt);
    setF(r, 15, `SUM(C${r}:N${r})`, bold, pct ? pctFmt : undefined);
    setF(r, 16, fn('P'), bold, fmt);
  }

  // O column only (SUM of months for input rows)
  function sumO(r: number) {
    wsPl.getRow(r).getCell(15).value = { formula: `SUM(C${r}:N${r})` };
  }

  // Ratio formula: numRow / denRow across all data cols (% format)
  function fxRatioPct(r: number, numRow: number, denRow: number) {
    setF(r, 2,  `IF(B${denRow}<>0,B${numRow}/B${denRow},0)`,  false, pctFmt);
    for (let m = 0; m < 12; m++) {
      const cl = colLetter(3 + m);
      setF(r, 3 + m, `IF(${cl}${denRow}<>0,${cl}${numRow}/${cl}${denRow},0)`, false, pctFmt);
    }
    setF(r, 15, `IF(O${denRow}<>0,O${numRow}/O${denRow},0)`, false, pctFmt);
    setF(r, 16, `IF(P${denRow}<>0,P${numRow}/P${denRow},0)`, false, pctFmt);
  }

  // Per-person formula: valueRow / staffRow (no %)
  function fxPerPerson(r: number, valueRow: number, staffRow: number) {
    setF(r, 2,  `IF(B${staffRow}<>0,B${valueRow}/B${staffRow},0)`);
    for (let m = 0; m < 12; m++) {
      const cl = colLetter(3 + m);
      setF(r, 3 + m, `IF(${cl}${staffRow}<>0,${cl}${valueRow}/${cl}${staffRow},0)`);
    }
    setF(r, 15, `IF(O${staffRow}<>0,O${valueRow}/O${staffRow},0)`);
    setF(r, 16, `IF(P${staffRow}<>0,P${valueRow}/P${staffRow},0)`);
  }

  // ── Header row R3 ──────────────────────────────────────────────────────────
  const hdr = wsPl.getRow(3);
  hdr.values = ['POSTES', `${year} Budget YTD`, ...MFR, `TOTAL ${year}`, `YTD ${year-1}`];
  hdr.font = boldFont;
  hdr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

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
  lbl(41, 'Nominal Income Tax Rate (%)');
  lbl(42, 'Average VAT Rate (%)');
  lbl(43, 'Staff Number');
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

  // R8: % Gross Margin = R7/R5  (O8 = IF ratio, not SUM)
  setF(8, 2, 'IF(B5<>0,B7/B5,0)', true, pctFmt);
  for (let m = 0; m < 12; m++) {
    const cl = colLetter(3 + m);
    setF(8, 3 + m, `IF(${cl}5<>0,${cl}7/${cl}5,0)`, true, pctFmt);
  }
  setF(8, 15, 'IF(O5<>0,O7/O5,0)', true, pctFmt); // O8 = ratio on totals, not SUM
  setF(8, 16, 'IF(P5<>0,P7/P5,0)', true, pctFmt);

  // R9: Frais généraux — B9 stays INPUT (budget), C-N & P = reference OVERHEADS (R71)
  // Budget (B9) is left empty for reporter to fill
  for (let m = 0; m < 12; m++) {
    const cl = colLetter(3 + m);
    setF(9, 3 + m, `${cl}71`, true);
  }
  setF(9, 16, 'P71', true);
  setF(9, 15, 'SUM(C9:N9)', true); // O9 = sum of monthly totals

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

  // R41-R42: manual inputs (rate %) — O only
  // R43: staff count — O only (already handled by sumO above)

  // R44: Gross Margin per staff = R7 / R43
  fxPerPerson(44, 7, 43);
  // R45: Operating Cost per staff = R9 / R43
  fxPerPerson(45, 9, 43);

  // ── Sheet "PL clients" ─────────────────────────────────────────────────────
  const wsC = wb.addWorksheet('PL clients');
  const kFmt = '#,##0';
  wsC.columns = [
    { width: 12 },
    { width: 22 },
    { width: 16, style: { numFmt: kFmt } },   // C – Mois courant (K€)
    { width: 16, style: { numFmt: kFmt } },   // D – YTD Actuals (K€)
    { width: 18, style: { numFmt: pctFmt } }, // E – Margin Rate YTD
    { width: 10, style: { numFmt: pctFmt } }, // F – Share
    { width: 16, style: { numFmt: kFmt } },   // G – TARGET YTD (K€)
    { width: 18, style: { numFmt: pctFmt } }, // H – Margin Rate budget
    { width: 10, style: { numFmt: pctFmt } }, // I – Share budget
  ];

  function cx(r: number, c: number, val: string | number | { formula: string } | null, bold = false, fmt?: string) {
    const cell = wsC.getRow(r).getCell(c);
    if (val !== null) cell.value = val as ExcelJS.CellValue;
    if (bold) cell.font = boldFont;
    if (fmt) cell.numFmt = fmt;
  }

  // A1 / A2: left empty — dropdowns are added below
  cx(1, 1, null);
  cx(2, 1, null);

  // Column headers
  cx(5, 2, 'Amounts in K EUR', false);
  cx(5, 7, `Budget ${year}`, false);
  wsC.getRow(6).values = [null, null, 'Mois courant', 'YTD Actuals', 'Margin Rate (YTD)', 'Share', 'TARGET YTD', 'Margin Rate', 'Share'];
  wsC.getRow(6).font = boldFont;

  // REVENUE block
  cx(8,  1, 'REVENUE', true); cx(8,  2, 'TOTAL',          true);
  cx(9,  1, 'REVENUE'); cx(9,  2, 'CLIENT 1');
  cx(10, 1, 'REVENUE'); cx(10, 2, 'CLIENT 2');
  cx(11, 1, 'REVENUE'); cx(11, 2, 'CLIENT 3');
  cx(12, 1, 'REVENUE'); cx(12, 2, 'AUTRES CLIENTS');
  cx(13, 1, 'REVENUE'); cx(13, 2, 'CLIENT 5');
  cx(14, 1, 'REVENUE'); cx(14, 2, 'CLIENT 6');

  // MARGIN block
  cx(16, 1, 'MARGIN',  true); cx(16, 2, 'TOTAL',          true);
  cx(17, 1, 'MARGIN'); cx(17, 2, 'CLIENT 1');
  cx(18, 1, 'MARGIN'); cx(18, 2, 'CLIENT 2');
  cx(19, 1, 'MARGIN'); cx(19, 2, 'CLIENT 3');
  cx(20, 1, 'MARGIN'); cx(20, 2, 'AUTRES CLIENTS');
  cx(21, 1, 'MARGIN'); cx(21, 2, 'CLIENT 5');
  cx(22, 1, 'MARGIN'); cx(22, 2, 'CLIENT 6');

  // REVENUE TOTAL (R8): C,D = SUM of clients; G = SUM budget; share = 1
  cx(8, 3, { formula: 'SUM(C9:C14)' }, true);
  cx(8, 4, { formula: 'SUM(D9:D14)' }, true);
  cx(8, 6, { formula: '1' },           true, pctFmt);
  cx(8, 7, { formula: 'SUM(G9:G14)' }, true);
  cx(8, 9, { formula: '1' },           true, pctFmt);

  // MARGIN TOTAL (R16)
  cx(16, 3, { formula: 'SUM(C17:C22)' },          true);
  cx(16, 4, { formula: 'SUM(D17:D22)' },          true);
  cx(16, 5, { formula: 'IF(D8<>0,D16/D8,0)' },    true, pctFmt); // global margin rate
  cx(16, 6, { formula: '1' },                     true, pctFmt);
  cx(16, 7, { formula: 'SUM(G17:G22)' },          true);
  cx(16, 8, { formula: 'IF(G8<>0,G16/G8,0)' },    true, pctFmt); // budget margin rate
  cx(16, 9, { formula: '1' },                     true, pctFmt);

  // Per-client formulas
  const revRows = [9,10,11,12,13,14];
  const mrgRows = [17,18,19,20,21,22];

  revRows.forEach(r => {
    cx(r, 6, { formula: `IF(D8<>0,D${r}/D8,0)` },  false, pctFmt);   // revenue share vs total
    cx(r, 9, { formula: `IF(G8<>0,G${r}/G8,0)` },  false, pctFmt);   // budget revenue share
  });
  mrgRows.forEach((r, i) => {
    const rv = revRows[i];
    cx(r, 5, { formula: `IF(D${rv}<>0,D${r}/D${rv},0)` },  false, pctFmt);  // margin rate
    cx(r, 6, { formula: `IF(D16<>0,D${r}/D16,0)` },        false, pctFmt);  // margin share
    cx(r, 8, { formula: `IF(G${rv}<>0,G${r}/G${rv},0)` },  false, pctFmt);  // budget margin rate
    cx(r, 9, { formula: `IF(G16<>0,G${r}/G16,0)` },        false, pctFmt);  // budget margin share
  });

  // ── Explicit number formats on "PL clients" data cells ────────────────────
  // Columns C (3), D (4), G (7) → K€ format; E (5), F (6), H (8), I (9) → %
  const dataRows = [8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22];
  for (const r of dataRows) {
    for (const c of [3, 4, 7]) wsC.getRow(r).getCell(c).numFmt = kFmt;
    for (const c of [5, 6, 8, 9]) wsC.getRow(r).getCell(c).numFmt = pctFmt;
  }

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
