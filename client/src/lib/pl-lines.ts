// Structure complète des lignes P&L — source unique pour tous les modules
// Correspond exactement aux rubriques du template Excel

export interface PlLineConfig {
  nom: string;
  computed?: boolean;  // ligne calculée (non saisie)
  subtotal?: boolean;  // solde intermédiaire
  total?: boolean;     // résultat final
  indent?: boolean;    // retrait visuel
  hint?: string;       // 'neg' = saisir en négatif
}

// ── P&L principal (lignes 5-33 du template) ──────────────────────────────────
export const MAIN_PL_LINES: PlLineConfig[] = [
  { nom: 'Revenue' },
  { nom: 'Cost of Sales',                   hint: 'neg' },
  { nom: 'Gross Margin',                    computed: true, subtotal: true },
  { nom: 'Overheads',                       hint: 'neg' },
  { nom: 'Other Operating Expenses',        hint: 'neg',  indent: true },
  { nom: 'Bad Debt Provision',              hint: 'neg',  indent: true },
  { nom: 'Provisions for Risks',            hint: 'neg',  indent: true },
  { nom: 'Other Operating Charges',         computed: true, indent: true },
  { nom: 'Proceeds from Asset Sales',                     indent: true },
  { nom: 'Bonus/Malus Disbursements',                     indent: true },
  { nom: 'Other Operating Revenues',                      indent: true },
  { nom: 'Reversal Bad Debt Provision',                   indent: true },
  { nom: 'Reversal Provisions for Risks',                 indent: true },
  { nom: 'Other Current Revenues',          computed: true, indent: true },
  { nom: 'EBITDA',                          computed: true, subtotal: true },
  { nom: 'Depreciation',                    hint: 'neg',  indent: true },
  { nom: 'Operating Income',                computed: true, subtotal: true },
  { nom: 'Financial Expenses',              hint: 'neg',  indent: true },
  { nom: 'Financial Income',                              indent: true },
  { nom: 'Net Cost of Debt',                computed: true, indent: true },
  { nom: 'Other Financial Expenses',        hint: 'neg',  indent: true },
  { nom: 'Other Financial Revenues',                      indent: true },
  { nom: 'Other Financial Gain & Loss',     computed: true, indent: true },
  { nom: 'Profit Before Tax',               computed: true, subtotal: true },
  { nom: 'Income Tax',                      hint: 'neg',  indent: true },
  { nom: 'Net Earnings',                    computed: true, total: true },
  { nom: 'Cash Flow',                       computed: true, total: true },
  { nom: 'Working Days' },
];

// ── Détail frais généraux (lignes 48-70 du template) ─────────────────────────
export const OVERHEAD_LINES: PlLineConfig[] = [
  { nom: 'Rent & Leasing' },
  { nom: 'Fuel' },
  { nom: 'Water & Electricity' },
  { nom: 'Maintenance' },
  { nom: 'Fees & Penalties' },
  { nom: 'Taxes (non-corporate)' },
  { nom: 'Salaries and personnel cost' },
  { nom: 'Travels, Hotels & Missions' },
  { nom: 'Staff Transport' },
  { nom: 'Professional Fees' },
  { nom: 'Temporary Staff' },
  { nom: 'Insurance' },
  { nom: 'Communications' },
  { nom: 'Bank Charges' },
  { nom: 'Office Supplies' },
  { nom: 'Donations & Gifts' },
  { nom: 'Professional Org. Contributions' },
  { nom: 'Small Equipment' },
  { nom: 'General Documentation' },
  { nom: 'Seminars' },
  { nom: 'Advertising' },
  { nom: 'Other Overhead Charges' },
  { nom: 'Management Fees' },
];

// ── Statistiques & ratios (lignes 34-45 du template) ─────────────────────────
export const STATS_LINES: PlLineConfig[] = [
  { nom: 'Income Tax / Profit Before Tax (%)',   computed: true },
  { nom: 'Net Earnings / Gross Margin (%)',       computed: true },
  { nom: 'Overheads / Gross Margin (%)',          computed: true },
  { nom: 'EBITDA / Gross Margin (%)',             computed: true },
  { nom: 'Depreciation / Gross Margin (%)',       computed: true },
  { nom: 'Operating Income / Gross Margin (%)',   computed: true },
  { nom: 'Financial Expenses / Gross Margin (%)', computed: true },
  { nom: 'Nominal Income Tax Rate (%)'  },
  { nom: 'Average VAT Rate (%)'         },
  { nom: 'Staff Number'                 },
  { nom: 'Gross Margin per Staff',       computed: true },
  { nom: 'Operating Cost per Staff',     computed: true },
];

// Sets pour le styling des vues tableau
export const SUBTOTAL_NOMS = new Set(MAIN_PL_LINES.filter(l => l.subtotal && !l.total).map(l => l.nom));
export const TOTAL_NOMS    = new Set(MAIN_PL_LINES.filter(l => l.total).map(l => l.nom));

// Calcul des lignes formulées à partir des saisies
export function computeFormulas(v: (nom: string) => number): Record<string, number> {
  const grossMargin     = v('Revenue') + v('Cost of Sales');
  const otherOpCharges  = v('Overheads') + v('Other Operating Expenses') + v('Bad Debt Provision') + v('Provisions for Risks');
  const otherCurrentRev = v('Proceeds from Asset Sales') + v('Bonus/Malus Disbursements') + v('Other Operating Revenues') + v('Reversal Bad Debt Provision') + v('Reversal Provisions for Risks');
  const ebitda          = grossMargin + otherOpCharges + otherCurrentRev;
  const opIncome        = ebitda + v('Depreciation');
  const netCostDebt     = v('Financial Expenses') + v('Financial Income');
  const otherFinGL      = v('Other Financial Expenses') + v('Other Financial Revenues');
  const pbt             = opIncome + netCostDebt + otherFinGL;
  const netEarnings     = pbt + v('Income Tax');
  const cashFlow        = netEarnings - v('Depreciation');
  const overheadsTotal  = OVERHEAD_LINES.reduce((s, l) => s + v(l.nom), 0);
  return {
    'Gross Margin': grossMargin,
    'Other Operating Charges': otherOpCharges,
    'Other Current Revenues': otherCurrentRev,
    'EBITDA': ebitda,
    'Operating Income': opIncome,
    'Net Cost of Debt': netCostDebt,
    'Other Financial Gain & Loss': otherFinGL,
    'Profit Before Tax': pbt,
    'Net Earnings': netEarnings,
    'Cash Flow': cashFlow,
    _OVERHEADS_TOTAL: overheadsTotal,
  };
}
