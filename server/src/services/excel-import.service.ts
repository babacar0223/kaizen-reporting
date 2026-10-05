import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';
import { isCompositeEntite } from '../lib/entiteGroups';

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

// Lignes clés qui ne devraient jamais être totalement vides si l'entité a une activité sur la
// période — sert à avertir d'une ligne probablement oubliée en préparant le fichier.
const CORE_LINES_EMPTY_CHECK = new Set(['Revenue', 'Cost of Sales', 'Gross Margin', 'EBITDA', 'Operating Income', 'Net Earnings']);

// Lignes que chaque entity reporter DOIT renseigner (index 0-based dans PL_ROW_MAP).
// Un import d'entité est refusé si l'une d'elles est vide/0 au mois de référence.
const MANDATORY_PL_LINES: Record<string, number> = {
  'Nominal Income Tax Rate (%)': 40,
  'Average VAT Rate (%)': 41,
  'Staff Number': 42,
};

// Détecte la position des colonnes de la feuille "PL" depuis la ligne d'en-tête ("POSTES").
// Tolère les deux dispositions : ancienne (A|Budget|C..N mois|O total|P YTD N-1)
// et nouvelle (A|YTD N-1|Budget|D..O mois|P total). Indices renvoyés en 0-based.
function detectPlColumns(headerRow: unknown[] | undefined): {
  colBudget: number; colM1: number; colYtdN1: number; yearFromHeader: number | null;
  fallback: { budget: boolean; month: boolean; ytdN1: boolean };
} {
  const cells = (headerRow ?? []).map(c => String(c ?? '').trim());
  let colBudget = -1, colM1 = -1, colYtdN1 = -1, yearFromHeader: number | null = null;
  for (let i = 1; i < cells.length; i++) {
    const h = cells[i].toLowerCase();
    if (!h) continue;
    if (colBudget === -1 && h.includes('budget')) {
      colBudget = i;
      const ym = cells[i].match(/(20\d{2})/);
      if (ym) yearFromHeader = parseInt(ym[1]);
    }
    if (colM1 === -1 && (h.startsWith('janv') || h === 'jan' || h.startsWith('jan-') || h.startsWith('jan '))) colM1 = i;
    if (colYtdN1 === -1 && h.includes('ytd') && !h.includes('budget') && !h.includes('total')) colYtdN1 = i;
  }
  // Repli sur l'ancienne disposition si un repère manque — signalé au caller pour avertir
  // l'utilisateur : une colonne mal détectée décale silencieusement toutes les valeurs.
  const fallback = { budget: colBudget === -1, month: colM1 === -1, ytdN1: colYtdN1 === -1 };
  if (colBudget === -1) colBudget = 1;
  if (colM1 === -1) colM1 = colBudget + 1;
  if (colYtdN1 === -1) colYtdN1 = colM1 + 12 + 1; // colonne juste après TOTAL
  return { colBudget, colM1, colYtdN1, yearFromHeader, fallback };
}

const MOIS_HEADER_RE = /^(janv|jan\b|févr|fevr|feb\b|mars|mar\b|avr|apr\b|mai|may\b|juin|jun\b|juil|jul\b|ao[uû]t|aug\b|sept|sep\b|oct|nov|d[ée]c)/i;

// Détecte les colonnes de la feuille "PL clients" (0-based) depuis sa ligne d'en-tête "Client".
// Tolère les colonnes calculées intercalées (Total YTD, GM YTD…). Repli sur la disposition
// compacte "Client | 12 Ventes | 12 COS | Budget".
// Index 0-based → lettre de colonne Excel (0→A, 25→Z, 26→AA…)
function colIndexToLetter(idx: number): string {
  let s = ''; let n = idx + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s || 'A';
}

function detectClientColumns(clientsData: unknown[][]): { colVentesM1: number; colCosM1: number; colBudget: number; budgetFound: boolean } {
  // Repère la ligne d'en-tête = celle qui contient le PLUS de noms de mois (janv, févr…),
  // quel que soit le contenu de la colonne A. Bien plus fiable qu'un test "== Client".
  let hdr: string[] | undefined;
  let bestCount = 0;
  for (let i = 0; i < Math.min(clientsData.length, 10); i++) {
    const row = (clientsData[i] as unknown[]) ?? [];
    const cells = row.map(c => String(c ?? '').trim());
    let count = 0;
    for (let j = 1; j < cells.length; j++) if (MOIS_HEADER_RE.test(cells[j])) count++;
    if (count > bestCount) { bestCount = count; hdr = cells; }
  }
  if (!hdr || bestCount < 3) return { colVentesM1: 1, colCosM1: 13, colBudget: 25, budgetFound: false };

  const monthCols: number[] = [];
  let colBudgetPref = -1;  // colonne "Budget" SANS "YTD" (budget annuel — celle qu'on veut)
  let colBudgetAny = -1;   // n'importe quelle colonne "Budget" (repli)
  for (let i = 1; i < hdr.length; i++) {
    if (MOIS_HEADER_RE.test(hdr[i])) monthCols.push(i);
    if (/budget/i.test(hdr[i])) {
      if (colBudgetAny === -1) colBudgetAny = i;
      if (colBudgetPref === -1 && !/ytd/i.test(hdr[i])) colBudgetPref = i;
    }
  }
  const colVentesM1 = monthCols.length >= 1 ? monthCols[0] : 1;
  const colCosM1 = monthCols.length >= 13 ? monthCols[12] : colVentesM1 + 12;
  let colBudget = colBudgetPref !== -1 ? colBudgetPref : colBudgetAny;
  const budgetFound = colBudget !== -1;
  if (colBudget === -1) colBudget = colCosM1 + 12;
  return { colVentesM1, colCosM1, colBudget, budgetFound };
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0);
}

function cfaToEur(amount: number): number {
  return amount / TAUX_CFA_EUR;
}

// Convertit une valeur exprimée dans la devise source de l'entité → EUR.
// `tauxConversion` = "1 EUR = X <deviseSource>" (ex. CFA/XOF → 655.957 ; EUR → 1) — taux par défaut
// de l'entité, utilisé sauf si `overrideTaux` fournit un taux spécifique à cette colonne (voir
// readCustomRates : le taux réel diffère souvent entre Actuals du mois en cours, Budget saisi plus
// tôt dans l'année, et YTD N-1 (2025), chacun converti au taux en vigueur à son époque).
// `ratioBu` = quote-part de l'entité dans sa BU (optionnel).
function makeEntityConverter(
  entite: { deviseSource: string | null; tauxConversion: unknown; ratioBu: unknown },
  overrideTaux?: number | null,
) {
  const devise = (entite.deviseSource || 'EUR').toUpperCase();
  const ratio = entite.ratioBu ? Number(entite.ratioBu) : 1;
  const hasOverride = overrideTaux !== undefined && overrideTaux !== null && isFinite(overrideTaux) && overrideTaux > 0;
  let taux = hasOverride ? overrideTaux : Number(entite.tauxConversion);
  if (!isFinite(taux) || taux <= 0) taux = 1;
  // Peg fixe si une entité CFA/XOF/XAF n'a pas de taux renseigné correctement.
  if (!hasOverride && (devise === 'CFA' || devise === 'XOF' || devise === 'XAF') && taux <= 1) taux = TAUX_CFA_EUR;
  const convert = (v: number): number => ((devise === 'EUR' || taux === 1) ? v : v / taux) * ratio;
  return { devise, taux, ratio, convert };
}

// Lit les 3 taux de change personnalisés en ligne 2 de la feuille "PL" (juste au-dessus de l'en-tête
// "POSTES", à hdrIdx-1 — PAS un index absolu : SheetJS peut ou non trimmer les lignes vides avant
// l'en-tête selon le fichier, exactement comme rowOffset s'adapte déjà à hdrIdx pour PL_ROW_MAP).
// Colonnes alignées sur les colonnes de données correspondantes (0-based) : B(1)=YTD N-1,
// C(2)=Budget, D(3)=1er mois → représente Actuals (même taux pour les 12 mois). Cellule vide ou
// ≤ 0 ⇒ null (repli sur le taux de conversion par défaut de l'entité).
function readCustomRates(plData: unknown[][], hdrIdx: number): { actuals: number | null; budget: number | null; n1: number | null } {
  const rateRow = plData[hdrIdx - 1] as unknown[] | undefined;
  const pick = (col: number): number | null => {
    const v = numericValue(rateRow?.[col]);
    return v > 0 ? v : null;
  };
  return { n1: pick(1), budget: pick(2), actuals: pick(3) };
}

const NON_NUMERIC_PLACEHOLDERS = new Set(['', '-', '–', '—', '.', 'N/A', 'NA', 'ND', '#N/A', '#VALUE!', '#REF!', '#DIV/0!', '#NAME?', '#NULL!', '#NUM!']);

// Nettoie une chaîne Excel en nombre. Gère : espaces (dont insécables/fines), symboles
// monétaires, %, négatifs comptables (1 234) ou 1 234-, séparateurs FR (1 234,56) et
// EN (1,234.56). Renvoie `null` si la valeur est un texte réellement non numérique.
function parseNumericString(raw: string): number | null {
  let s = raw.trim();
  if (NON_NUMERIC_PLACEHOLDERS.has(s) || NON_NUMERIC_PLACEHOLDERS.has(s.toUpperCase())) return 0;

  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (/[-–]\s*$/.test(s)) { neg = true; s = s.replace(/[-–]\s*$/, ''); }
  if (/^[-–]/.test(s)) { neg = !neg; s = s.replace(/^[-–]\s*/, ''); }

  // Retire tous les espaces (\s couvre aussi insécables/fines/étroites), symboles monétaires et %
  s = s.replace(/\s/g, '').replace(/[€$£¥%]/g, '');
  if (s === '') return 0;
  // Aucun chiffre après nettoyage => vrai texte non numérique (signalé, pas silencieusement mis à 0)
  if (!/[0-9]/.test(s)) return null;
  s = s.replace(/[A-Za-zÀ-ÿ]/g, ''); // unités résiduelles éventuelles (K, EUR…)
  if (s === '') return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Le séparateur le plus à droite est le séparateur décimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const commas = (s.match(/,/g) || []).length;
    const decimals = s.length - lastComma - 1;
    // Une seule virgule avec 1–2 décimales → séparateur décimal ; sinon séparateur de milliers.
    s = (commas === 1 && decimals >= 1 && decimals <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, ''); // 1.234.567 → milliers
  }

  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

function numericValue(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (val instanceof Date) return 0; // une date dans une cellule montant : on ignore
  const parsed = parseNumericString(String(val));
  return parsed === null ? 0 : parsed;
}

// true si la cellule contient un texte NON vide qui n'a PAS pu être interprété comme un nombre
// (utile pour prévenir l'utilisateur d'une saisie à corriger sans bloquer l'import).
function isUnparsableNumber(val: unknown): boolean {
  if (val === null || val === undefined || typeof val === 'number' || typeof val === 'boolean') return false;
  if (val instanceof Date) return false;
  const s = String(val).trim();
  if (s === '') return false;
  return parseNumericString(s) === null;
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
      if (isCompositeEntite(entite.id)) {
        result.errors.push(`"${entite.nomCourt}" est une entité consolidée : importez directement dans ses entités filles`);
        continue;
      }

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
      if (isCompositeEntite(entite.id)) {
        result.errors.push(`"${entite.nomCourt}" est une entité consolidée : importez directement dans ses entités filles`);
        continue;
      }

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
  userId: number,
  allowedEntiteIds?: number[]   // si défini, restreint l'import aux entités listées (reporter non-admin)
): Promise<ImportResult & { detectedMonths: number[]; referenceMois: number; entiteId?: number; bu?: string; entiteNom?: string; annee?: number; devise?: string; tauxDevise?: number; tauxDeviseBudget?: number; tauxDeviseN1?: number; parseWarnings?: string[] }> {
  const result: { created: number; updated: number; errors: string[]; detectedMonths: number[]; referenceMois: number; entiteId?: number; bu?: string; entiteNom?: string; annee?: number; devise?: string; tauxDevise?: number; tauxDeviseBudget?: number; tauxDeviseN1?: number; parseWarnings?: string[] } =
    { created: 0, updated: 0, errors: [], detectedMonths: [], referenceMois: moisParam };
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Cellules non numériques rencontrées (texte ⇒ importées comme 0) — signalées, non bloquantes.
  const parseWarnings: string[] = [];
  const MOIS_FR = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const noteBad = (where: string) => { if (parseWarnings.length < 20 && !parseWarnings.includes(where)) parseWarnings.push(where); };

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
  if (isCompositeEntite(entite.id)) {
    result.errors.push(`"${entite.nomCourt}" est une entité consolidée (somme de ses entités filles) : importez directement dans chacune de ses parties.`);
    return result;
  }
  if (allowedEntiteIds && !allowedEntiteIds.includes(entite.id)) {
    result.errors.push(`Vous n'avez pas les droits pour importer les données de l'entité "${entite.nomCourt}"`);
    return result;
  }

  result.entiteId = entite.id;
  result.bu = bu;
  result.entiteNom = entite.nomCourt;

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

  // Position des colonnes (Budget / mois / YTD N-1) détectée depuis l'en-tête — supporte
  // l'ancienne ET la nouvelle disposition (YTD N-1 déplacé en 2e position).
  const { colBudget, colM1, colYtdN1, yearFromHeader, fallback } = detectPlColumns(plData[hdrIdx] as unknown[]);
  const monthCol = (m: number) => colM1 + (m - 1); // m = 1..12
  if (fallback.budget || fallback.month || fallback.ytdN1) {
    const which = [fallback.budget && 'Budget', fallback.month && 'mois (janv.)', fallback.ytdN1 && `YTD ${annee - 1}`].filter(Boolean).join(', ');
    noteBad(`En-tête colonne non reconnu (${which}) — position déduite par défaut, vérifiez les montants importés`);
  }

  // Devise de l'entité — conversion → EUR. Un taux distinct par groupe de colonnes (Actuals /
  // Budget / YTD N-1) si renseigné en ligne 2 de la feuille "PL" (readCustomRates), sinon repli
  // sur le taux de conversion par défaut de l'entité pour les 3 — le taux réel diffère souvent
  // entre les mois en cours, le budget saisi plus tôt dans l'année et les actuals 2025.
  const customRates = readCustomRates(plData, hdrIdx);
  const { devise, taux: tauxDevise, convert: convertActuals } = makeEntityConverter(entite, customRates.actuals);
  const { taux: tauxDeviseBudget, convert: convertBudget } = makeEntityConverter(entite, customRates.budget);
  const { taux: tauxDeviseN1, convert: convertN1 } = makeEntityConverter(entite, customRates.n1);
  result.devise = devise;
  result.tauxDevise = tauxDevise;
  if (tauxDeviseBudget !== tauxDevise) result.tauxDeviseBudget = tauxDeviseBudget;
  if (tauxDeviseN1 !== tauxDevise) result.tauxDeviseN1 = tauxDeviseN1;

  const effectiveYear = yearFromHeader ?? annee;
  result.annee = effectiveYear;

  // Auto-détection : quels mois ont au moins une valeur non nulle ? + repérage des cellules texte
  // + lignes clés totalement vides alors que d'autres lignes ont des données sur la période
  // (signe probable d'une ligne oubliée en préparant le fichier, pas une vraie valeur nulle).
  const filledMonthsSet = new Set<number>();
  const emptyCoreLines: string[] = [];
  for (const [idxStr, ligneName] of Object.entries(PL_ROW_MAP)) {
    const row = plData[parseInt(idxStr) + rowOffset] as unknown[] | undefined;
    if (!row) {
      if (CORE_LINES_EMPTY_CHECK.has(ligneName)) emptyCoreLines.push(ligneName);
      continue;
    }
    let hasAnyValue = false;
    for (let m = 1; m <= 12; m++) {
      const cell = row[monthCol(m)];
      if (numericValue(cell) !== 0) { filledMonthsSet.add(m); hasAnyValue = true; }
      if (isUnparsableNumber(cell)) noteBad(`PL · ${ligneName} · ${MOIS_FR[m - 1]}`);
    }
    if (numericValue(row[colBudget]) !== 0) hasAnyValue = true;
    if (numericValue(row[colYtdN1]) !== 0) hasAnyValue = true;
    if (isUnparsableNumber(row[colBudget])) noteBad(`PL · ${ligneName} · Budget`);
    if (isUnparsableNumber(row[colYtdN1])) noteBad(`PL · ${ligneName} · YTD ${effectiveYear - 1}`);
    if (!hasAnyValue && CORE_LINES_EMPTY_CHECK.has(ligneName)) emptyCoreLines.push(ligneName);
  }
  const filledMonths = [...filledMonthsSet].sort((a, b) => a - b);
  const referenceMois = filledMonths.length > 0 ? Math.max(...filledMonths) : moisParam;
  result.detectedMonths = filledMonths;
  result.referenceMois  = referenceMois;
  if (filledMonths.length > 0 && emptyCoreLines.length > 0) {
    noteBad(`Ligne(s) entièrement vide(s) sur toute la période alors que d'autres lignes ont des valeurs : ${emptyCoreLines.join(', ')} — vérifiez qu'elles n'ont pas été oubliées`);
  }

  // ── Lignes obligatoires (TVA, IS, effectif) — l'import est refusé si absentes ──
  // Vérifiées pour CHAQUE mois réellement reporté (= mois où Revenue ≠ 0), pour ne pas
  // être trompé par une ligne de taux saisie constante sur les 12 colonnes.
  const revenueRow = plData[4 + rowOffset] as unknown[] | undefined;
  const reportedMonths = filledMonths.filter(m => revenueRow && numericValue(revenueRow[monthCol(m)]) !== 0);
  const checkMonths = reportedMonths.length > 0 ? reportedMonths : filledMonths;
  const missingMandatory = Object.entries(MANDATORY_PL_LINES)
    .filter(([, idx]) => {
      const row = plData[idx + rowOffset] as unknown[] | undefined;
      return checkMonths.some(m => !row || numericValue(row[monthCol(m)]) === 0);
    })
    .map(([name]) => name);
  if (missingMandatory.length > 0) {
    result.errors.push(
      `Import refusé : lignes obligatoires non renseignées pour tous les mois reportés (${checkMonths.join(', ')}) — ${missingMandatory.join(', ')}. Complétez ces lignes dans la feuille "PL" puis relancez l'import.`,
    );
    return result;
  }

  for (const [idxStr, ligneName] of Object.entries(PL_ROW_MAP)) {
    const rowIdx = parseInt(idxStr) + rowOffset;
    const row = plData[rowIdx] as unknown[] | undefined;
    if (!row) continue;
    const lignePlId = ligneMap.get(ligneName);
    if (!lignePlId) { result.errors.push(`Ligne P&L "${ligneName}" introuvable`); continue; }

    // Ratio/%, staff-count rows must not be converted CFA→EUR
    const isNoConvert = PL_NO_CONVERT_INDICES.has(parseInt(idxStr));
    const cvtActuals = isNoConvert ? (v: number) => v : convertActuals;
    const cvtBudget = isNoConvert ? (v: number) => v : convertBudget;
    const cvtN1 = isNoConvert ? (v: number) => v : convertN1;

    // Actuals MTD : importer TOUS les mois détectés (upsert par mois — pas de doublon en ré-import).
    // Un mois présent dans le fichier fait foi : si une valeur déjà en base repasse à 0, on l'écrase.
    for (const m of filledMonths) {
      const raw = numericValue(row[monthCol(m)]);
      const actuals = cvtActuals(raw);
      const date = lastDayOfMonth(effectiveYear, m);
      try {
        const existing = await prisma.faitPl.findUnique({
          where: { date_entiteId_lignePlId_typeValeur_typePeriode: { date, entiteId: entite.id, lignePlId, typeValeur: 'ACTUALS', typePeriode: 'MTD' } },
        });
        if (existing) {
          await prisma.faitPl.update({ where: { id: existing.id }, data: { montant: actuals, sourceOnglet: 'PL' } });
          result.updated++;
        } else if (raw !== 0) {
          await prisma.faitPl.create({ data: { date, annee: effectiveYear, mois: m, entiteId: entite.id, bu, lignePlId, typeValeur: 'ACTUALS', typePeriode: 'MTD', montant: actuals, sourceOnglet: 'PL' } });
          result.created++;
        }
      } catch (e) { result.errors.push(`${ligneName} ACTUALS m${m}: ${e}`); }
    }

    // Purge les lignes TARGET/YTD_N1 fantômes d'un précédent import à un autre mois de référence
    // (la clé unique inclut la date → un ré-import à un mois de référence différent créerait un
    // doublon au lieu d'écraser l'ancien, laissant une valeur obsolète invisible mais bien réelle).
    try {
      await prisma.faitPl.deleteMany({
        where: {
          entiteId: entite.id, lignePlId, annee: effectiveYear, typePeriode: 'YTD',
          typeValeur: { in: ['TARGET', 'YTD_N1'] },
          mois: { not: referenceMois },
        },
      });
    } catch (e) { result.errors.push(`${ligneName} purge TARGET/YTD_N1 obsolètes: ${e}`); }

    // Budget YTD → TARGET YTD, taggé sur le mois de référence auto-détecté
    const budgetYtd = cvtBudget(numericValue(row[colBudget]));
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

    // YTD N-1 (année précédente) → YTD_N1 YTD, taggé sur le mois de référence auto-détecté
    const ytdN1 = cvtN1(numericValue(row[colYtdN1]));
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

  // ── 4. Traiter la feuille "PL clients" ──────────────────────────────────
  // Colonnes détectées depuis l'en-tête "Client" (tolère les colonnes calculées
  // intercalées : Total YTD, GM YTD, Budget YTD…). L'import ne lit que Ventes / COS /
  // Budget Annuel ; le reste est recalculé côté plateforme.
  // Lecture de TOUTES les lignes client jusqu'à "TOTAL" (nombre illimité).
  const cc = detectClientColumns(clientsData);
  const clientRows: Array<{
    date: Date; annee: number; mois: number; entiteId: number; bu: string;
    clientNom: string; lignePl: string; typeValeur: string;
    montant: number; marginRate: number | null; sharePct: number | null; sourceOnglet: string;
  }> = [];

  const CLIENT_HEADER_TOKENS = new Set(['CLIENT', 'CLIENTS', 'NOM', 'NOM DU CLIENT']);

  for (let i = 0; i < clientsData.length; i++) {
    const row = clientsData[i] as unknown[];
    if (!row) continue;
    const clientNom = String(row[0] ?? '').trim();
    if (!clientNom) continue;
    const upper = clientNom.toUpperCase();
    if (i >= 2 && upper === 'TOTAL') break; // fin de la liste des clients
    if (upper === 'TOTAL' || CLIENT_HEADER_TOKENS.has(upper)) continue;
    // Ignore les 2 premières lignes de contrôle (A1 = BU, A2 = entité)
    if (i < 2) continue;

    // Montants dans la devise de l'entité, en unité pleine (comme la feuille PL). Conversion → EUR uniquement.
    const budgetAnnuel = convertBudget(numericValue(row[cc.colBudget]));
    if (isUnparsableNumber(row[cc.colBudget])) noteBad(`PL clients · ${clientNom} · Budget`);

    for (let m = 1; m <= 12; m++) {
      const cVentes = row[cc.colVentesM1 + (m - 1)];
      const cCos = row[cc.colCosM1 + (m - 1)];
      if (isUnparsableNumber(cVentes)) noteBad(`PL clients · ${clientNom} · Ventes ${MOIS_FR[m - 1]}`);
      if (isUnparsableNumber(cCos)) noteBad(`PL clients · ${clientNom} · COS ${MOIS_FR[m - 1]}`);
      const ventes = convertActuals(numericValue(cVentes));
      const cos    = convertActuals(numericValue(cCos));
      if (ventes === 0 && cos === 0) continue;
      const date = lastDayOfMonth(effectiveYear, m);
      clientRows.push({ date, annee: effectiveYear, mois: m, entiteId: entite.id, bu, clientNom, lignePl: 'Revenue',       typeValeur: 'ACTUALS', montant: ventes,          marginRate: null, sharePct: null, sourceOnglet: 'PL clients' });
      clientRows.push({ date, annee: effectiveYear, mois: m, entiteId: entite.id, bu, clientNom, lignePl: 'Cost of Sales', typeValeur: 'ACTUALS', montant: cos,             marginRate: null, sharePct: null, sourceOnglet: 'PL clients' });
      clientRows.push({ date, annee: effectiveYear, mois: m, entiteId: entite.id, bu, clientNom, lignePl: 'Gross Margin',  typeValeur: 'ACTUALS', montant: ventes - cos,    marginRate: null, sharePct: null, sourceOnglet: 'PL clients' });
    }

    if (budgetAnnuel !== 0) {
      const date = lastDayOfMonth(effectiveYear, referenceMois);
      clientRows.push({ date, annee: effectiveYear, mois: referenceMois, entiteId: entite.id, bu, clientNom, lignePl: 'Revenue', typeValeur: 'TARGET', montant: budgetAnnuel, marginRate: null, sharePct: null, sourceOnglet: 'PL clients' });
    }
  }

  // Suppression ciblée : on ne remplace QUE les mois clients présents dans ce fichier
  // (+ toutes les lignes budget/TARGET, ré-énoncées à chaque import). Ainsi un reporter
  // qui ré-importe seulement août n'efface pas janv→juil ; s'il ré-importe janv→août,
  // tout est réécrit sans doublon.
  const clientMonths = [...new Set(
    clientRows.filter(r => r.typeValeur === 'ACTUALS').map(r => r.mois),
  )];
  await prisma.faitRevenusClients.deleteMany({
    where: {
      entiteId: entite.id,
      annee: effectiveYear,
      sourceOnglet: 'PL clients',
      OR: [
        ...(clientMonths.length > 0 ? [{ mois: { in: clientMonths } }] : []),
        { typeValeur: 'TARGET' },
      ],
    },
  });

  let clientsCreated = 0;
  if (clientRows.length > 0) {
    await prisma.faitRevenusClients.createMany({ data: clientRows });
    clientsCreated = clientRows.length;
  }

  if (parseWarnings.length > 0) result.parseWarnings = parseWarnings;

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'IMPORT',
      tableName: 'fait_pl',
      entiteId: entite.id,
      periode: `${effectiveYear}-${String(referenceMois).padStart(2, '0')}`,
      details: { bu, entite: entite.nomCourt, annee: effectiveYear, devise, tauxDevise, detectedMonths: filledMonths, referenceMois, plCreated: result.created, plUpdated: result.updated, clientsCreated, errors: result.errors.length, parseWarnings: parseWarnings.length },
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
  ventesYtd: number;
  cosYtd: number;
  margeYtd: number;
  tauxMarge: number | null;
  budgetAnnuel: number;
  months: number[]; // mois renseignés (Ventes ou COS ≠ 0)
}

export interface PreviewResult {
  errors: string[];
  mandatoryWarnings?: string[]; // lignes obligatoires (TVA/IS/effectif) manquantes — bloquantes à l'import
  parseWarnings?: string[];     // cellules texte non numériques (importées comme 0) — non bloquantes
  bu?: string;
  entiteNom?: string;
  annee?: number;
  isCfa?: boolean;
  devise?: string;
  tauxDevise?: number;
  tauxDeviseBudget?: number;
  tauxDeviseN1?: number;
  detectedMonths?: number[];
  referenceMois?: number;
  clientCols?: { ventes: string; cos: string; budget: string; budgetFound: boolean }; // colonnes détectées feuille "PL clients"
  lines: PreviewLine[];
  statsLines: PreviewLine[];
  overheadLines: PreviewLine[];
  clientLines: ClientPreviewRow[];
}

function buildPreviewLine(
  row: unknown[], filledMonths: number[],
  convertActuals: (v: number) => number, convertBudget: (v: number) => number, convertN1: (v: number) => number,
  cols: { colBudget: number; colM1: number; colYtdN1: number },
): { budget: number; months: Record<number, number>; ytdN1: number } {
  const months: Record<number, number> = {};
  for (const m of filledMonths) months[m] = convertActuals(numericValue((row as unknown[])[cols.colM1 + (m - 1)]));
  return {
    budget: convertBudget(numericValue((row as unknown[])[cols.colBudget])),
    months,
    ytdN1: convertN1(numericValue((row as unknown[])[cols.colYtdN1])),
  };
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
  if (isCompositeEntite(entite.id)) {
    result.errors.push(`"${entite.nomCourt}" est une entité consolidée (somme de ses entités filles) : importez directement dans chacune de ses parties.`);
    return result;
  }

  result.bu = bu;
  result.entiteNom = entite.nomCourt;

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

  // Un taux distinct par groupe de colonnes (Actuals / Budget / YTD N-1) si renseigné en ligne 2 de
  // la feuille "PL" — même logique que importPlTemplate, pour que l'aperçu colle exactement à
  // l'import réel.
  const customRates = readCustomRates(plData, hdrIdx);
  const { devise, taux: tauxDevise, convert: convertActuals } = makeEntityConverter(entite, customRates.actuals);
  const { taux: tauxDeviseBudget, convert: convertBudget } = makeEntityConverter(entite, customRates.budget);
  const { taux: tauxDeviseN1, convert: convertN1 } = makeEntityConverter(entite, customRates.n1);
  result.devise = devise;
  result.tauxDevise = tauxDevise;
  if (tauxDeviseBudget !== tauxDevise) result.tauxDeviseBudget = tauxDeviseBudget;
  if (tauxDeviseN1 !== tauxDevise) result.tauxDeviseN1 = tauxDeviseN1;
  result.isCfa = devise === 'CFA' || devise === 'XOF' || devise === 'XAF';

  const cols = detectPlColumns(plData[hdrIdx] as unknown[]);
  const pMonthCol = (m: number) => cols.colM1 + (m - 1);
  result.annee = cols.yearFromHeader ?? fallbackAnnee;

  // Detect filled months + repérage des cellules texte non numériques
  const MOIS_FR = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const parseWarnings: string[] = [];
  const noteBad = (w: string) => { if (parseWarnings.length < 20 && !parseWarnings.includes(w)) parseWarnings.push(w); };
  if (cols.fallback.budget || cols.fallback.month || cols.fallback.ytdN1) {
    const which = [cols.fallback.budget && 'Budget', cols.fallback.month && 'mois (janv.)', cols.fallback.ytdN1 && 'YTD N-1'].filter(Boolean).join(', ');
    noteBad(`En-tête colonne non reconnu (${which}) — position déduite par défaut, vérifiez les montants importés`);
  }
  const filledMonthsSet = new Set<number>();
  const emptyCoreLinesPreview: string[] = [];
  for (const [idxStr, ligneName] of Object.entries(PL_ROW_MAP)) {
    const row = plData[parseInt(idxStr) + rowOffset] as unknown[] | undefined;
    if (!row) {
      if (CORE_LINES_EMPTY_CHECK.has(ligneName)) emptyCoreLinesPreview.push(ligneName);
      continue;
    }
    let hasAnyValue = false;
    for (let m = 1; m <= 12; m++) {
      const cell = row[pMonthCol(m)];
      if (numericValue(cell) !== 0) { filledMonthsSet.add(m); hasAnyValue = true; }
      if (isUnparsableNumber(cell)) noteBad(`PL · ${ligneName} · ${MOIS_FR[m - 1]}`);
    }
    if (numericValue(row[cols.colBudget]) !== 0) hasAnyValue = true;
    if (numericValue(row[cols.colYtdN1]) !== 0) hasAnyValue = true;
    if (isUnparsableNumber(row[cols.colBudget])) noteBad(`PL · ${ligneName} · Budget`);
    if (isUnparsableNumber(row[cols.colYtdN1])) noteBad(`PL · ${ligneName} · YTD ${(result.annee ?? 0) - 1}`);
    if (!hasAnyValue && CORE_LINES_EMPTY_CHECK.has(ligneName)) emptyCoreLinesPreview.push(ligneName);
  }
  const filledMonths = [...filledMonthsSet].sort((a, b) => a - b);
  result.detectedMonths = filledMonths;
  if (filledMonths.length > 0 && emptyCoreLinesPreview.length > 0) {
    noteBad(`Ligne(s) entièrement vide(s) sur toute la période alors que d'autres lignes ont des valeurs : ${emptyCoreLinesPreview.join(', ')} — vérifiez qu'elles n'ont pas été oubliées`);
  }
  const previewRefMois = filledMonths.length > 0 ? Math.max(...filledMonths) : 1;
  result.referenceMois = previewRefMois;

  // Lignes obligatoires (TVA / IS / effectif) — signalées ici, bloquantes à l'import réel
  const previewRevenueRow = plData[4 + rowOffset] as unknown[] | undefined;
  const previewReported = filledMonths.filter(m => previewRevenueRow && numericValue(previewRevenueRow[pMonthCol(m)]) !== 0);
  const previewCheckMonths = previewReported.length > 0 ? previewReported : (filledMonths.length > 0 ? filledMonths : [previewRefMois]);
  result.mandatoryWarnings = Object.entries(MANDATORY_PL_LINES)
    .filter(([, idx]) => {
      const row = plData[idx + rowOffset] as unknown[] | undefined;
      return previewCheckMonths.some(m => !row || numericValue(row[pMonthCol(m)]) === 0);
    })
    .map(([name]) => name);

  // Build ALL main P&L lines
  for (const rowIdxBase of PREVIEW_MAIN_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    result.lines.push({ nom, ...buildPreviewLine(row, filledMonths, convertActuals, convertBudget, convertN1, cols) });
  }

  // Build stats / ratio lines (no CFA conversion for dimensionless rows)
  const identity = (v: number) => v;
  for (const rowIdxBase of PREVIEW_STATS_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    const noConvert = PL_NO_CONVERT_INDICES.has(rowIdxBase);
    result.statsLines.push({
      nom,
      ...buildPreviewLine(
        row, filledMonths,
        noConvert ? identity : convertActuals, noConvert ? identity : convertBudget, noConvert ? identity : convertN1,
        cols,
      ),
    });
  }

  // Build overhead detail lines
  for (const rowIdxBase of PREVIEW_OVERHEAD_ROWS) {
    const nom = PL_ROW_MAP[rowIdxBase];
    if (!nom) continue;
    const row = plData[rowIdxBase + rowOffset] as unknown[] | undefined;
    if (!row) continue;
    result.overheadLines.push({ nom, ...buildPreviewLine(row, filledMonths, convertActuals, convertBudget, convertN1, cols) });
  }

  // Build PL clients preview — colonnes détectées depuis l'en-tête (tolère colonnes calculées)
  const ccPrev = detectClientColumns(clientsData);
  result.clientCols = {
    ventes: colIndexToLetter(ccPrev.colVentesM1),
    cos: colIndexToLetter(ccPrev.colCosM1),
    budget: colIndexToLetter(ccPrev.colBudget),
    budgetFound: ccPrev.budgetFound,
  };
  const headerTokens = new Set(['CLIENT', 'CLIENTS', 'NOM', 'NOM DU CLIENT']);
  for (let i = 2; i < clientsData.length; i++) {
    const row = clientsData[i] as unknown[];
    if (!row) continue;
    const clientNom = String(row[0] ?? '').trim();
    if (!clientNom) continue;
    const upper = clientNom.toUpperCase();
    if (upper === 'TOTAL') break; // fin de la liste des clients
    if (headerTokens.has(upper)) continue;

    let ventesYtd = 0, cosYtd = 0;
    const months: number[] = [];
    for (let m = 1; m <= 12; m++) {
      const cv = row[ccPrev.colVentesM1 + (m - 1)];
      const cc = row[ccPrev.colCosM1 + (m - 1)];
      if (isUnparsableNumber(cv)) noteBad(`PL clients · ${clientNom} · Ventes ${MOIS_FR[m - 1]}`);
      if (isUnparsableNumber(cc)) noteBad(`PL clients · ${clientNom} · COS ${MOIS_FR[m - 1]}`);
      const v = convertActuals(numericValue(cv));
      const c = convertActuals(numericValue(cc));
      if (v !== 0 || c !== 0) months.push(m);
      ventesYtd += v;
      cosYtd += c;
    }
    if (isUnparsableNumber(row[ccPrev.colBudget])) noteBad(`PL clients · ${clientNom} · Budget`);
    const margeYtd = ventesYtd - cosYtd;
    result.clientLines.push({
      clientNom,
      ventesYtd,
      cosYtd,
      margeYtd,
      tauxMarge: ventesYtd !== 0 ? margeYtd / ventesYtd : null,
      budgetAnnuel: convertBudget(numericValue(row[ccPrev.colBudget])),
      months,
    });
  }

  if (parseWarnings.length > 0) result.parseWarnings = parseWarnings;
  return result;
}

// ── LOGISTICS: onglets entité (CSTT, AM, AFR CI...) en CFA ──────────────────
export async function importLogisticsEntite(
  buffer: Buffer,
  annee: number,
  mois: number,
  nomCourt: string,
  userId: number,
  allowedEntiteIds?: number[]   // si défini, restreint l'import aux entités listées (reporter non-admin)
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
  if (isCompositeEntite(entite.id)) {
    result.errors.push(`"${entite.nomCourt}" est une entité consolidée (somme de ses entités filles) : importez directement dans chacune de ses parties.`);
    return result;
  }
  if (allowedEntiteIds && !allowedEntiteIds.includes(entite.id)) {
    result.errors.push(`Vous n'avez pas les droits pour importer les données de l'entité "${entite.nomCourt}"`);
    return result;
  }

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
