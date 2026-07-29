import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── BU ──────────────────────────────────────────────────────────────────
  const procBu = await prisma.dimBu.upsert({
    where: { nomCourt: 'PROC' },
    update: {},
    create: { nom: 'Procurement', nomCourt: 'PROC', couleurUi: '#1B5E8B' },
  });
  const ffBu = await prisma.dimBu.upsert({
    where: { nomCourt: 'FF' },
    update: {},
    create: { nom: 'Freight Forwarding', nomCourt: 'FF', couleurUi: '#4A1E8B' },
  });
  const logBu = await prisma.dimBu.upsert({
    where: { nomCourt: 'LOG' },
    update: {},
    create: { nom: 'Logistics', nomCourt: 'LOG', couleurUi: '#0E6B5E' },
  });

  // ── Entités PROCUREMENT ───────────────────────────────────────────────────
  const entitesProc = [
    { nom: 'Afrilog South Africa', nomCourt: 'AFRILOG SA', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'CTA NV', nomCourt: 'CTA NV', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'CTA Sénégal', nomCourt: 'CTA SN', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'Afrilog International', nomCourt: 'AFRILOG INTL', deviseSource: 'EUR', tauxConversion: 1 },
  ];
  for (const e of entitesProc) {
    await prisma.dimEntite.upsert({
      where: { nomCourt: e.nomCourt },
      update: {},
      create: { ...e, buId: procBu.id },
    });
  }

  // ── Entités FREIGHT FORWARDING ────────────────────────────────────────────
  const entitesFf = [
    { nom: 'Multilog SA', nomCourt: 'MULTILOG SA', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'Uni-Forwarding International', nomCourt: 'UFI', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'Uni-Forwarding Inc USA', nomCourt: 'UFI USA', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'AGS Frasers', nomCourt: 'AGS', deviseSource: 'EUR', tauxConversion: 1 },
  ];
  for (const e of entitesFf) {
    await prisma.dimEntite.upsert({
      where: { nomCourt: e.nomCourt },
      update: {},
      create: { ...e, buId: ffBu.id },
    });
  }

  // ── Entités LOGISTICS (CFA) ────────────────────────────────────────────────
  // Rename legacy 'CSTT' back to canonical 'CSTT AO' if it was incorrectly renamed
  await prisma.dimEntite.updateMany({ where: { nomCourt: 'CSTT' }, data: { nomCourt: 'CSTT AO' } });

  const entitesLog = [
    { nom: 'CSTT Afrique de l\'Ouest', nomCourt: 'CSTT AO', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Afrilog Mali', nomCourt: 'AM', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Afrilog Côte d\'Ivoire', nomCourt: 'AFR CI', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Multilog CI', nomCourt: 'MCI', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Multilog SA Logistics', nomCourt: 'MULT SA', deviseSource: 'EUR', tauxConversion: 1, ratioBu: 0.049 },
    { nom: 'Meryt', nomCourt: 'MERYT', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'PMA', nomCourt: 'PMA', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Afrilog International (LOG)', nomCourt: 'A intl', deviseSource: 'EUR', tauxConversion: 1 },
    { nom: 'Afrilog Burkina Faso', nomCourt: 'AFRILOG BF', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Afrilog Sénégal', nomCourt: 'AFRILOG SN', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Multilog CI (Logistics)', nomCourt: 'MULTILOG CI', deviseSource: 'CFA', tauxConversion: 655.957 },
    { nom: 'Afrilog CI', nomCourt: 'AFRILOG CI', deviseSource: 'CFA', tauxConversion: 655.957 },
  ];
  for (const e of entitesLog) {
    await prisma.dimEntite.upsert({
      where: { nomCourt: e.nomCourt },
      update: {},
      create: { ...e, buId: logBu.id },
    });
  }

  // ── Lignes P&L ────────────────────────────────────────────────────────────
  const lignes = [
    // Soldes principaux
    { nom: 'Revenue', ordreAffichage: 1, type: 'PRODUIT' },
    { nom: 'Cost of Sales', ordreAffichage: 2, type: 'CHARGE' },
    { nom: 'Gross Margin', ordreAffichage: 3, type: 'SOLDE' },
    { nom: 'Overheads', ordreAffichage: 4, type: 'CHARGE' },
    { nom: 'Salaries and personnel cost', ordreAffichage: 5, type: 'CHARGE' },
    { nom: 'Travels, Hotels & Missions', ordreAffichage: 6, type: 'CHARGE' },
    { nom: 'Other expenses/revenues', ordreAffichage: 7, type: 'CHARGE' },
    { nom: 'Operating Income before M.Fees', ordreAffichage: 8, type: 'SOLDE' },
    { nom: 'Management Fees', ordreAffichage: 9, type: 'CHARGE' },
    { nom: 'EBITDA', ordreAffichage: 10, type: 'SOLDE' },
    { nom: 'Operating Income', ordreAffichage: 11, type: 'SOLDE' },
    { nom: 'Net Earnings', ordreAffichage: 12, type: 'SOLDE' },
    { nom: 'Cash Flow', ordreAffichage: 13, type: 'SOLDE' },
    { nom: 'Working Days', ordreAffichage: 14, type: 'INFO' },
    // Détail charges d'exploitation (issu du template)
    { nom: 'Other Operating Expenses', ordreAffichage: 20, type: 'CHARGE' },
    { nom: 'Bad Debt Provision', ordreAffichage: 21, type: 'CHARGE' },
    { nom: 'Provisions for Risks', ordreAffichage: 22, type: 'CHARGE' },
    { nom: 'Other Operating Charges', ordreAffichage: 23, type: 'CHARGE' },
    { nom: 'Proceeds from Asset Sales', ordreAffichage: 24, type: 'PRODUIT' },
    { nom: 'Bonus/Malus Disbursements', ordreAffichage: 25, type: 'SOLDE' },
    { nom: 'Other Operating Revenues', ordreAffichage: 26, type: 'PRODUIT' },
    { nom: 'Reversal Bad Debt Provision', ordreAffichage: 27, type: 'PRODUIT' },
    { nom: 'Reversal Provisions for Risks', ordreAffichage: 28, type: 'PRODUIT' },
    { nom: 'Other Current Revenues', ordreAffichage: 29, type: 'PRODUIT' },
    { nom: 'Depreciation', ordreAffichage: 30, type: 'CHARGE' },
    { nom: 'Financial Expenses', ordreAffichage: 31, type: 'CHARGE' },
    { nom: 'Financial Income', ordreAffichage: 32, type: 'PRODUIT' },
    { nom: 'Net Cost of Debt', ordreAffichage: 33, type: 'CHARGE' },
    { nom: 'Other Financial Expenses', ordreAffichage: 34, type: 'CHARGE' },
    { nom: 'Other Financial Revenues', ordreAffichage: 35, type: 'PRODUIT' },
    { nom: 'Other Financial Gain & Loss', ordreAffichage: 36, type: 'SOLDE' },
    { nom: 'Profit Before Tax', ordreAffichage: 37, type: 'SOLDE' },
    { nom: 'Income Tax', ordreAffichage: 38, type: 'CHARGE' },
    // Détail frais généraux
    { nom: 'Rent & Leasing', ordreAffichage: 50, type: 'CHARGE' },
    { nom: 'Fuel', ordreAffichage: 51, type: 'CHARGE' },
    { nom: 'Water & Electricity', ordreAffichage: 52, type: 'CHARGE' },
    { nom: 'Maintenance', ordreAffichage: 53, type: 'CHARGE' },
    { nom: 'Fees & Penalties', ordreAffichage: 54, type: 'CHARGE' },
    { nom: 'Taxes (non-corporate)', ordreAffichage: 55, type: 'CHARGE' },
    { nom: 'Staff Transport', ordreAffichage: 56, type: 'CHARGE' },
    { nom: 'Professional Fees', ordreAffichage: 57, type: 'CHARGE' },
    { nom: 'Temporary Staff', ordreAffichage: 58, type: 'CHARGE' },
    { nom: 'Insurance', ordreAffichage: 59, type: 'CHARGE' },
    { nom: 'Communications', ordreAffichage: 60, type: 'CHARGE' },
    { nom: 'Bank Charges', ordreAffichage: 61, type: 'CHARGE' },
    { nom: 'Office Supplies', ordreAffichage: 62, type: 'CHARGE' },
    { nom: 'Donations & Gifts', ordreAffichage: 63, type: 'CHARGE' },
    { nom: 'Professional Org. Contributions', ordreAffichage: 64, type: 'CHARGE' },
    { nom: 'Small Equipment', ordreAffichage: 65, type: 'CHARGE' },
    { nom: 'General Documentation', ordreAffichage: 66, type: 'CHARGE' },
    { nom: 'Seminars', ordreAffichage: 67, type: 'CHARGE' },
    { nom: 'Advertising', ordreAffichage: 68, type: 'CHARGE' },
    { nom: 'Other Overhead Charges', ordreAffichage: 69, type: 'CHARGE' },
  ];
  for (const l of lignes) {
    await prisma.dimLignePl.upsert({
      where: { nom: l.nom },
      update: {},
      create: l,
    });
  }

  // ── Trésorerie journalière ─────────────────────────────────────────────────
  const treasuryEntites = [
    { nom: 'AFRILOG MALI', pays: 'Mali', groupe: 'WEST AFRICA' },
    { nom: "AFRILOG CI", pays: "Côte d'Ivoire", groupe: 'WEST AFRICA' },
    { nom: 'CSTT-AO', pays: 'Sénégal', groupe: 'WEST AFRICA' },
    { nom: 'AFRILOG SN', pays: 'Sénégal', groupe: 'WEST AFRICA' },
    { nom: 'AFRICAN LOGISTIC PLATFORM', pays: 'Sénégal', groupe: 'WEST AFRICA' },
    { nom: 'AFRILOG SA', pays: 'Afrique du Sud', groupe: 'SOUTHERN AFRICA' },
    { nom: 'AFRILOG MOZ', pays: 'Mozambique', groupe: 'SOUTHERN AFRICA' },
    { nom: 'AFRILOG GN', pays: 'Guinée', groupe: 'WEST AFRICA' },
    { nom: 'MULTILOG SA', pays: 'Afrique du Sud', groupe: 'SOUTHERN AFRICA' },
    { nom: 'AGS', pays: 'Afrique du Sud', groupe: 'SOUTHERN AFRICA' },
    { nom: 'UFI', pays: 'Belgique', groupe: 'EUROPE' },
    { nom: 'CTA NV', pays: 'Belgique', groupe: 'EUROPE' },
    { nom: 'AFRILOG BURKINA', pays: 'Burkina Faso', groupe: 'WEST AFRICA' },
    { nom: 'MULTIOG CI', pays: "Côte d'Ivoire", groupe: 'WEST AFRICA' },
    { nom: 'AFRILOG GABON', pays: 'Gabon', groupe: 'WEST AFRICA' },
    { nom: 'CTA BF', pays: 'Burkina Faso', groupe: 'EUROPE' },
    { nom: 'CTA SN', pays: 'Sénégal', groupe: 'EUROPE' },
    { nom: 'IMPAXIS', pays: 'Multi-pays', groupe: 'WEST AFRICA' },
    { nom: 'PANAFRICAN MARITIME ALLIANCE', pays: 'Multi-pays', groupe: 'WEST AFRICA' },
    { nom: 'GROUPE AFRICA ALLIANCE', pays: 'Multi-pays', groupe: 'WEST AFRICA' },
    { nom: 'AFRILOG SIERRA L', pays: 'Sierra Leone', groupe: 'WEST AFRICA' },
    { nom: 'AFRILOG TANZANIE', pays: 'Tanzanie', groupe: 'SOUTHERN AFRICA' },
    { nom: 'AFRILOG INTERNATIONAL', pays: 'Multi-pays', groupe: 'MAURITIUS' },
    { nom: 'MERYT MARITIME SERVICES', pays: 'Mauritus', groupe: 'MAURITIUS' },
  ];

  const treasuryEntiteMap = new Map<string, number>();
  for (const e of treasuryEntites) {
    const rec = await prisma.tresorerieEntite.upsert({
      where: { nom: e.nom },
      update: { pays: e.pays, groupe: e.groupe },
      create: e,
    });
    treasuryEntiteMap.set(e.nom, rec.id);
  }

  // Devise déduite du nom de compte ; à défaut XOF (zone UEMOA). Cas ambigus
  // corrigés manuellement (ORABANK GB → Gabon = XAF, SKYE BANK → Guinée = GNF,
  // STD CH DEPOSIT → dépôt ZAR confirmé par Feuil1 du classeur source).
  // Ces valeurs restent éditables depuis l'écran d'admin.
  const CURRENCY_TOKENS = ['ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'MUR', 'CNY', 'GNF', 'MZN', 'TZS', 'SLL'];
  const BANK_CURRENCY_OVERRIDES: Record<string, string> = {
    'STD CHRTD DEPOSIT': 'ZAR',
    'ORABANK GB': 'XAF',
    'SKYE BANK': 'GNF',
  };
  function inferDevise(nomBanque: string): string {
    if (BANK_CURRENCY_OVERRIDES[nomBanque]) return BANK_CURRENCY_OVERRIDES[nomBanque];
    const upper = nomBanque.toUpperCase();
    for (const token of CURRENCY_TOKENS) {
      if (upper.includes(token)) return token;
    }
    return 'XOF';
  }

  const treasuryBanques: Array<{ nom: string; entite: string; typeCompte: string }> = [
    { nom: 'ECOBANK LOULO', entite: 'AFRILOG MALI', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK MORILLA', entite: 'AFRILOG MALI', typeCompte: 'Compte Courant' },
    { nom: 'Orabank', entite: 'AFRILOG MALI', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK CI', entite: 'AFRILOG CI', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK DD', entite: 'AFRILOG CI', typeCompte: 'Découvert' },
    { nom: 'ECOBANK DAT', entite: 'AFRILOG CI', typeCompte: 'Dépôt à Terme' },
    { nom: 'Orabank CI', entite: 'AFRILOG CI', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK CSTT EXPL', entite: 'CSTT-AO', typeCompte: 'Exploitation' },
    { nom: 'ECOBANK CSTT INVEST', entite: 'CSTT-AO', typeCompte: 'Investissement' },
    { nom: 'BICIS SN', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'CBAO SN', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'SGBS SN', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'BIS SN', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'SGBS SALAIRES', entite: 'CSTT-AO', typeCompte: 'Salaires' },
    { nom: 'Orabank SN', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'CREDIT DU SENEGAL', entite: 'CSTT-AO', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK SN', entite: 'AFRILOG SN', typeCompte: 'Compte Courant' },
    { nom: 'CDS', entite: 'AFRILOG SN', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK ALP', entite: 'AFRICAN LOGISTIC PLATFORM', typeCompte: 'Compte Courant' },
    { nom: 'STD CHRTD ZAR', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CHRTD EUR', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CHRTD USD', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CH CURRENT (AUD)', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CH CURRENT GBP', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CHRTD DEPOSIT', entite: 'AFRILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'STD CH CURRENT (MZN) 1', entite: 'AFRILOG MOZ', typeCompte: 'Dépôt à Terme' },
    { nom: 'STD CH CURRENT (USD)', entite: 'AFRILOG MOZ', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK GNF', entite: 'AFRILOG GN', typeCompte: 'Compte Courant' },
    { nom: 'COFINA GNF', entite: 'AFRILOG GN', typeCompte: 'Compte Courant' },
    { nom: 'SKYE BANK', entite: 'AFRILOG GN', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK CALL ZAR', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK GUARANTEE (ZAR)', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK Overdraft (ZAR)', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK RC FACILITY  (ZAR)', entite: 'MULTILOG SA', typeCompte: 'Compte Call' },
    { nom: 'NEDBANK CURRENT ZAR', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK EUR', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK USD', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK GBP', entite: 'MULTILOG SA', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK CALL ZAR', entite: 'AGS', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK CURRENT ZAR', entite: 'AGS', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK EUR', entite: 'AGS', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK USD', entite: 'AGS', typeCompte: 'Compte Courant' },
    { nom: 'NEDBANK GBP', entite: 'AGS', typeCompte: 'Compte Courant' },
    { nom: 'BNP EUR', entite: 'UFI', typeCompte: 'Compte Courant' },
    { nom: 'KBC EUR', entite: 'UFI', typeCompte: 'Compte Courant' },
    { nom: 'BNP USD', entite: 'UFI', typeCompte: 'Compte Courant' },
    { nom: 'BNP EUR', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'BNP USD', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'KBC ZAR', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'KBC EUR', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'KBC USD', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'KBC GBP', entite: 'CTA NV', typeCompte: 'Compte Courant' },
    { nom: 'ECOBANK BF', entite: 'AFRILOG BURKINA', typeCompte: 'Compte Courant' },
    { nom: 'ORABANK CI', entite: 'MULTIOG CI', typeCompte: 'Compte Courant' },
    { nom: 'ORABANK GB', entite: 'AFRILOG GABON', typeCompte: 'Compte Courant' },
    { nom: 'BICIAB', entite: 'CTA BF', typeCompte: 'Compte Courant' },
    { nom: 'Crédit International', entite: 'CTA SN', typeCompte: 'Compte Courant' },
    { nom: 'Sunu Bank', entite: 'CTA SN', typeCompte: 'Compte Courant' },
    { nom: 'Société Générale', entite: 'CTA SN', typeCompte: 'Compte Courant' },
    { nom: 'ORABANK SOUS COMPTE', entite: 'CTA SN', typeCompte: 'Compte Courant' },
    { nom: 'ORABANK', entite: 'CTA SN', typeCompte: 'Compte Courant' },
    { nom: 'IMPAXIS', entite: 'IMPAXIS', typeCompte: 'Compte Courant' },
    { nom: 'ORABANK', entite: 'PANAFRICAN MARITIME ALLIANCE', typeCompte: 'Compte Courant' },
    { nom: 'AFRICA ALLIANCE MALI', entite: 'GROUPE AFRICA ALLIANCE', typeCompte: 'Compte Courant' },
    { nom: 'AFRICA ALLIANCE CI', entite: 'GROUPE AFRICA ALLIANCE', typeCompte: 'Compte Courant' },
    { nom: 'AFRICA ALLIANCE BN', entite: 'GROUPE AFRICA ALLIANCE', typeCompte: 'Compte Courant' },
    { nom: 'AFRICA ALLIANCE SN', entite: 'GROUPE AFRICA ALLIANCE', typeCompte: 'Compte Courant' },
    { nom: 'PETTY CASH', entite: 'GROUPE AFRICA ALLIANCE', typeCompte: 'Caisse' },
    { nom: 'SLL', entite: 'AFRILOG SIERRA L', typeCompte: 'Compte Courant' },
    { nom: 'USD', entite: 'AFRILOG SIERRA L', typeCompte: 'Compte Courant' },
    { nom: 'TZS', entite: 'AFRILOG TANZANIE', typeCompte: 'Compte Courant' },
    { nom: 'USD', entite: 'AFRILOG TANZANIE', typeCompte: 'Compte Courant' },
    { nom: 'MCB EUR', entite: 'AFRILOG INTERNATIONAL', typeCompte: 'Compte Courant' },
    { nom: 'MCB USD', entite: 'AFRILOG INTERNATIONAL', typeCompte: 'Compte Courant' },
    { nom: 'MCB MUR', entite: 'AFRILOG INTERNATIONAL', typeCompte: 'Compte Courant' },
    { nom: 'MCB GBP', entite: 'AFRILOG INTERNATIONAL', typeCompte: 'Compte Courant' },
    { nom: 'MCB CNY', entite: 'AFRILOG INTERNATIONAL', typeCompte: 'Compte Courant' },
    { nom: 'MCB EUR', entite: 'MERYT MARITIME SERVICES', typeCompte: 'Compte Courant' },
    { nom: 'MCB USD', entite: 'MERYT MARITIME SERVICES', typeCompte: 'Compte Courant' },
  ];

  for (const b of treasuryBanques) {
    const entiteId = treasuryEntiteMap.get(b.entite);
    if (!entiteId) continue;
    await prisma.tresorerieBanque.upsert({
      where: { entiteId_nom: { entiteId, nom: b.nom } },
      update: { typeCompte: b.typeCompte, devise: inferDevise(b.nom) },
      create: { nom: b.nom, entiteId, typeCompte: b.typeCompte, devise: inferDevise(b.nom) },
    });
  }

  // Taux de change au XOF — valeurs relevées dans Feuil1 du classeur source ;
  // à réactualiser ensuite depuis l'écran d'admin. Les devises sans taux connu
  // dans le classeur sont créées avec un taux placeholder (1) à corriger.
  const treasuryDevises = [
    { code: 'XOF', libelle: 'Franc CFA (UEMOA)', tauxXof: 1 },
    { code: 'USD', libelle: 'Dollar américain', tauxXof: 555.56 },
    { code: 'EUR', libelle: 'Euro', tauxXof: 655.96 },
    { code: 'GBP', libelle: 'Livre sterling', tauxXof: 754.09 },
    { code: 'ZAR', libelle: 'Rand sud-africain', tauxXof: 33.61 },
    { code: 'AUD', libelle: 'Dollar australien', tauxXof: 398.10 },
    { code: 'MUR', libelle: 'Roupie mauricienne', tauxXof: 11.96 },
    { code: 'CNY', libelle: 'Yuan chinois', tauxXof: 81.96 },
    { code: 'GNF', libelle: 'Franc guinéen', tauxXof: 1 },
    { code: 'XAF', libelle: 'Franc CFA (CEMAC)', tauxXof: 1 },
    { code: 'MZN', libelle: 'Metical mozambicain', tauxXof: 1 },
    { code: 'TZS', libelle: 'Shilling tanzanien', tauxXof: 1 },
    { code: 'SLL', libelle: 'Leone sierra-léonais', tauxXof: 1 },
  ];
  for (const d of treasuryDevises) {
    await prisma.tresorerieDevise.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
  }

  // ── Super Admin ────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('Admin@2026!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@kaizen-bs.com' },
    update: {},
    create: {
      email: 'admin@kaizen-bs.com',
      passwordHash: hash,
      nom: 'Admin',
      prenom: 'Kaizen',
      role: 'SUPER_ADMIN',
      buAccess: ['PROCUREMENT', 'FREIGHT_FORWARDING', 'LOGISTICS'],
      entitesAccess: [],
    },
  });

  console.log('✅ Seed terminé');
}

main().catch(console.error).finally(() => prisma.$disconnect());
