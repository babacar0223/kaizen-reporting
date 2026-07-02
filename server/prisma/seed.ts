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
  // Rename legacy nomCourt 'CSTT AO' → 'CSTT' if it still exists
  await prisma.dimEntite.updateMany({ where: { nomCourt: 'CSTT AO' }, data: { nomCourt: 'CSTT' } });

  const entitesLog = [
    { nom: 'CSTT Afrique de l\'Ouest', nomCourt: 'CSTT', deviseSource: 'CFA', tauxConversion: 655.957 },
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
