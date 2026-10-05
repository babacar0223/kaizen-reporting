import { jsPDF } from 'jspdf';

// Rapport « Consolidated P&L » — PDF structuré (texte + tableaux dessinés), pas une capture d'écran.
// Les montants proviennent des mêmes appels getKpiBu que la page, donc le PDF colle à ce qui est affiché.
// Les polices jsPDF intégrées (helvetica) n'encodent que du Latin-1 / WinAnsi : tout texte tracé passe
// par asc() qui remplace tirets longs, points de suspension, espaces Unicode et le symbole € par de
// l'ASCII sûr, sinon les glyphes sortent vides ou faux.

export interface KpiLine {
  label: string;
  actuals: number;
  budget: number;              // Budget YTD tel qu'importé, non reproratisé
  achievement: number | null;  // ratio actuals/budget (0.86 = 86 %), null si pas de budget
}

export interface EntityKpi {
  nom: string;
  nomCourt: string;
  lines: KpiLine[];           // même ordre / mêmes labels que `consolidated`
}

export interface ConsolidatedPlPdfInput {
  orgName: string;
  scopeLabel: string;        // « Procurement », « Group »…
  periodLabel: string;       // « YTD Sep 2026 »
  consolidated: KpiLine[];
  entities: EntityKpi[];
  generatedAt?: Date;
}

type RGB = [number, number, number];
const NAVY: RGB = [27, 58, 107];
const LIGHT: RGB = [237, 243, 250];
const GREY: RGB = [107, 114, 128];
const INK: RGB = [31, 41, 55];
const GREEN: RGB = [21, 133, 122];
const RED: RGB = [220, 38, 38];
const AMBER: RGB = [232, 160, 0];
const TOTAL_FILL: RGB = [214, 224, 240];

// Logo CSTT — chargé une fois (côté navigateur uniquement) et mis en cache en mémoire pour les
// générations suivantes dans la même session. Échec silencieux (image manquante, CORS...) : le PDF
// se génère quand même, juste sans logo plutôt que de planter tout l'export.
let logoCache: Promise<{ dataUrl: string; w: number; h: number } | null> | null = null;
function loadLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!logoCache) {
    logoCache = new Promise(resolve => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(img, 0, 0);
            resolve({ dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = '/CSTT-AO.png';
      } catch {
        resolve(null);
      }
    });
  }
  return logoCache;
}

const MARGIN = 14;
const ROW_H = 8;
const PAD_X = 2;
const DASH = '-';

function asc(s: string): string {
  return s
    .replace(/[    ]/g, ' ') // espaces insecables / fines
    .replace(/[‒–—−]/g, '-')  // tirets longs, signe moins
    .replace(/…/g, '...')                    // points de suspension
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/€/g, ' EUR');                  // € absent des polices intégrées
}

// Montant : séparateur de milliers = espace normale (pas l'espace fine d'Intl fr-FR), suffixe EUR.
function eur(v: number, compact = false): string {
  const n = Math.round(v);
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M EUR`;
    if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k EUR`;
  }
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} EUR`;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function text(pdf: jsPDF, s: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' }): void {
  pdf.text(asc(s), x, y, opts);
}

function fit(pdf: jsPDF, s: string, widthMm: number): string {
  const t0 = asc(s);
  if (pdf.getTextWidth(t0) <= widthMm) return t0;
  let t = t0;
  while (t.length > 1 && pdf.getTextWidth(`${t}...`) > widthMm) t = t.slice(0, -1);
  return `${t}...`;
}

function sectionTitle(pdf: jsPDF, s: string, y: number): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...NAVY);
  text(pdf, s, MARGIN, y);
  return y + 5;
}

interface TableOpts {
  x: number;
  y: number;
  widths: number[];
  align: ('left' | 'right')[];
  header: string[];
  rows: string[][];
  goodBad?: (boolean | null)[];   // colore la dernière colonne : true=vert, false=rouge, null=gris
  emptyLabel?: string;
  totalRow?: { cells: string[]; goodBad?: boolean | null };  // ligne de total en gras, fond distinct
}

function drawTable(pdf: jsPDF, o: TableOpts): number {
  const pageH = pdf.internal.pageSize.getHeight();
  const totalW = o.widths.reduce((a, b) => a + b, 0);
  let y = o.y;

  const drawHeader = () => {
    pdf.setFillColor(...NAVY);
    pdf.rect(o.x, y, totalW, ROW_H, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    let cx = o.x;
    o.header.forEach((h, i) => {
      const a = o.align[i];
      text(pdf, h, a === 'right' ? cx + o.widths[i] - PAD_X : cx + PAD_X, y + 5.4, { align: a });
      cx += o.widths[i];
    });
    y += ROW_H;
  };

  drawHeader();
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);

  if (o.rows.length === 0) {
    pdf.setTextColor(...GREY);
    text(pdf, o.emptyLabel ?? 'No data', o.x + PAD_X, y + 5.4);
    return y + ROW_H;
  }

  o.rows.forEach((row, ri) => {
    if (y + ROW_H > pageH - 16) {
      pdf.addPage();
      y = 20;
      drawHeader();
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
    }
    if (ri % 2 === 1) {
      pdf.setFillColor(...LIGHT);
      pdf.rect(o.x, y, totalW, ROW_H, 'F');
    }
    let cx = o.x;
    row.forEach((cell, i) => {
      const a = o.align[i];
      const isVarCol = !!o.goodBad && i === row.length - 1;
      if (isVarCol) {
        const v = o.goodBad![ri];
        pdf.setTextColor(...(v === null ? GREY : v ? GREEN : RED));
      } else {
        pdf.setTextColor(...INK);
      }
      const inner = o.widths[i] - PAD_X * 2;
      const txt = a === 'left' ? fit(pdf, cell, inner) : asc(cell);
      pdf.text(txt, a === 'right' ? cx + o.widths[i] - PAD_X : cx + PAD_X, y + 5.4, { align: a });
      cx += o.widths[i];
    });
    y += ROW_H;
  });

  if (o.totalRow && o.rows.length > 0) {
    if (y + ROW_H > pageH - 16) {
      pdf.addPage();
      y = 20;
      drawHeader();
    }
    pdf.setFillColor(...TOTAL_FILL);
    pdf.rect(o.x, y, totalW, ROW_H, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    let cx = o.x;
    o.totalRow.cells.forEach((cell, i) => {
      const a = o.align[i];
      const isVarCol = i === o.totalRow!.cells.length - 1 && o.totalRow!.goodBad !== undefined;
      if (isVarCol) {
        const v = o.totalRow!.goodBad;
        pdf.setTextColor(...(v === null ? GREY : v ? GREEN : RED));
      } else {
        pdf.setTextColor(...NAVY);
      }
      const inner = o.widths[i] - PAD_X * 2;
      const txt = a === 'left' ? fit(pdf, cell, inner) : asc(cell);
      pdf.text(txt, a === 'right' ? cx + o.widths[i] - PAD_X : cx + PAD_X, y + 5.4, { align: a });
      cx += o.widths[i];
    });
    y += ROW_H;
    pdf.setFont('helvetica', 'normal');
  }

  pdf.setDrawColor(...GREY);
  pdf.setLineWidth(0.1);
  pdf.line(o.x, y, o.x + totalW, y);
  return y;
}

interface BarSeries { label: string; actuals: number; budget?: number }

// Graphique en barres dessiné en primitives jsPDF (pas de canvas/html2canvas) — fiable à 100%,
// même rendu quel que soit l'environnement, cohérent avec le reste du PDF dessiné "à la main".
// Barres négatives supportées (EBITDA/Net Earnings peuvent être négatifs) via une ligne de base à 0.
function drawBarChart(pdf: jsPDF, o: {
  x: number; y: number; width: number; height: number;
  series: BarSeries[];
  fmt: (v: number) => string;
  legend?: [string, string];
}): number {
  const { x, y, width, height, series, fmt } = o;
  if (series.length === 0) return y;

  const legendH = o.legend ? 6 : 0;
  const axisLabelW = 16;
  const xLabelH = 8;
  const chartX = x + axisLabelW;
  const chartW = width - axisLabelW;
  const chartY = y + legendH;
  const chartH = height - legendH - xLabelH;

  const hasBudget = series.some(s => s.budget !== undefined);
  const vals = series.flatMap(s => (s.budget !== undefined ? [s.actuals, s.budget] : [s.actuals]));
  const maxVal = Math.max(0, ...vals);
  const minVal = Math.min(0, ...vals);
  const range = maxVal - minVal || 1;
  const zeroY = chartY + chartH * (maxVal / range);

  if (o.legend) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setFillColor(...NAVY);
    pdf.rect(chartX, y, 3, 3, 'F');
    pdf.setTextColor(...INK);
    text(pdf, o.legend[0], chartX + 4.5, y + 2.6);
    const w1 = pdf.getTextWidth(asc(o.legend[0])) + 14;
    pdf.setFillColor(...AMBER);
    pdf.rect(chartX + w1, y, 3, 3, 'F');
    text(pdf, o.legend[1], chartX + w1 + 4.5, y + 2.6);
  }

  // Grille horizontale + repères d'échelle
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.1);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(...GREY);
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = maxVal - (range * i) / steps;
    const ly = chartY + (chartH * i) / steps;
    pdf.line(chartX, ly, chartX + chartW, ly);
    text(pdf, fmt(v), chartX - 2, ly + 1.2, { align: 'right' });
  }

  if (minVal < 0 && maxVal > 0) {
    pdf.setDrawColor(...GREY);
    pdf.setLineWidth(0.3);
    pdf.line(chartX, zeroY, chartX + chartW, zeroY);
  }

  const n = series.length;
  const groupW = chartW / n;
  const barW = hasBudget ? groupW * 0.3 : groupW * 0.5;

  series.forEach((s, i) => {
    const cx = chartX + i * groupW + groupW / 2;
    const drawBar = (val: number, color: RGB, offset: number) => {
      const h = (Math.abs(val) / range) * chartH;
      const top = val >= 0 ? zeroY - h : zeroY;
      pdf.setFillColor(...color);
      pdf.rect(cx + offset - barW / 2, top, barW, Math.max(h, 0.3), 'F');
    };
    if (hasBudget) {
      drawBar(s.actuals, NAVY, -barW * 0.55);
      if (s.budget !== undefined) drawBar(s.budget, AMBER, barW * 0.55);
    } else {
      drawBar(s.actuals, NAVY, 0);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...GREY);
    text(pdf, fit(pdf, s.label, groupW - 1), cx, chartY + chartH + 4.5, { align: 'center' });
  });

  pdf.setDrawColor(...GREY);
  pdf.setLineWidth(0.15);
  pdf.rect(chartX, chartY, chartW, chartH);

  return y + height;
}

export function exportConsolidatedPlPdf(input: ConsolidatedPlPdfInput): void {
  const { orgName, scopeLabel, periodLabel, consolidated, entities } = input;
  const generatedAt = input.generatedAt ?? new Date();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;

  // Bandeau
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, pageW, 24, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  text(pdf, 'Consolidated P&L', MARGIN, 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  text(pdf, orgName, MARGIN, 18.5);
  text(
    pdf,
    `Generated ${generatedAt.toLocaleDateString('en-GB')} ${generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    pageW - MARGIN,
    18.5,
    { align: 'right' },
  );

  let y = 36;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...INK);
  text(pdf, `Scope: ${scopeLabel}`, MARGIN, y);
  text(pdf, `Period: ${periodLabel}`, MARGIN + 75, y);
  y += 11;

  // Consolidé
  y = sectionTitle(pdf, 'Consolidated - all entities in scope', y);
  y = drawTable(pdf, {
    x: MARGIN,
    y,
    widths: [contentW * 0.34, contentW * 0.24, contentW * 0.24, contentW * 0.18],
    align: ['left', 'right', 'right', 'right'],
    header: ['Indicator', 'Actuals', 'Budget', 'Achievement'],
    rows: consolidated.map(l => [
      l.label,
      eur(l.actuals),
      l.budget ? eur(l.budget) : DASH,
      l.achievement === null ? DASH : pct(l.achievement),
    ]),
    goodBad: consolidated.map(l => (l.budget !== 0 ? l.actuals >= l.budget : null)),
  });
  y += 12;

  // Par entité
  y = sectionTitle(pdf, 'By entity - Actuals for the period', y);
  const labels = consolidated.map(l => l.label);
  const entW = contentW * 0.34;
  const numW = (contentW - entW) / labels.length;
  y = drawTable(pdf, {
    x: MARGIN,
    y,
    widths: [entW, ...labels.map(() => numW)],
    align: ['left', ...labels.map(() => 'right' as const)],
    header: ['Entity', ...labels],
    rows: entities.map(e => [
      `${e.nom} (${e.nomCourt})`,
      ...e.lines.map(l => (l.actuals ? eur(l.actuals, true) : DASH)),
    ]),
    emptyLabel: 'No entity in this scope',
  });

  y += 7;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8);
  pdf.setTextColor(...GREY);
  text(
    pdf,
    `"${DASH}" = no data imported for this entity over the period. Budget is the YTD target as imported (cumulative to the entity's reference month).`,
    MARGIN,
    y,
  );

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    text(pdf, `${orgName} - Reporting Group - Confidential`, MARGIN, pageH - 8);
    text(pdf, `Page ${i} / ${total}`, pageW - MARGIN, pageH - 8, { align: 'right' });
  }

  const slug = scopeLabel.toLowerCase().replace(/\s+/g, '-');
  pdf.save(`consolidated-pl-${slug}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}

// ─── Rapport analytique complet (Statistics → Full Report) ──────────────────
// Même structure Consolidated + By-entity que exportConsolidatedPlPdf, enrichie de ratios clés,
// d'une comparaison N/N-1 et des enseignements automatiques déjà affichés à l'écran — pensé pour
// être remis en l'état à un décideur (période et BU choisies librement, indépendantes du filtre
// global de la plateforme).

export interface RatioLine {
  label: string;
  actuals: number | null;   // fraction (0.32 = 32 %)
  target: number | null;
  lowerIsBetter?: boolean;  // ex. Cost of Sales / Overheads % of Revenue : actuals < target = bon
}

export interface YoyLine {
  label: string;
  current: number;
  prior: number;
  growth: number | null;    // fraction
}

export interface ClientFocusRow {
  clientNom: string;
  groupe: string;
  revenue: number;
  margin: number;
  marginRate: number | null;
  achievement: number | null;  // vs budget annuel prorata
}

export interface ClientGroupRow {
  groupe: string;
  revenue: number;
  share: number;    // fraction du revenu client total du périmètre
  margin: number;
  marginRate: number | null;
}

export interface ClientsFocusInput {
  topClients: ClientFocusRow[];
  groups: ClientGroupRow[];
}

export interface StatisticsReportInput {
  orgName: string;
  scopeLabel: string;
  periodLabel: string;
  consolidated: KpiLine[];
  entities: EntityKpi[];
  ratios: RatioLine[];
  yoy: YoyLine[];
  clients?: ClientsFocusInput;
  insights: string[];
  generatedAt?: Date;
}

export async function exportStatisticsReportPdf(input: StatisticsReportInput): Promise<void> {
  const { orgName, scopeLabel, periodLabel, consolidated, entities, ratios, yoy, clients, insights } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const logo = await loadLogo();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;

  const ensureRoom = (needed: number, yNow: number): number => {
    if (yNow + needed <= pageH - 16) return yNow;
    pdf.addPage();
    return 20;
  };

  // Bandeau
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, pageW, 26, 'F');
  let titleX = MARGIN;
  if (logo) {
    const logoH = 16;
    const logoW = logoH * (logo.w / logo.h);
    pdf.addImage(logo.dataUrl, 'PNG', MARGIN, 5, logoW, logoH);
    titleX = MARGIN + logoW + 4;
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  text(pdf, 'Full Analytical Report', titleX, 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  text(pdf, orgName, titleX, 18.5);
  text(
    pdf,
    `Generated ${generatedAt.toLocaleDateString('en-GB')} ${generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    pageW - MARGIN,
    18.5,
    { align: 'right' },
  );

  let y = 38;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...INK);
  text(pdf, `Scope: ${scopeLabel}`, MARGIN, y);
  text(pdf, `Period: ${periodLabel}`, MARGIN + 75, y);
  y += 11;

  // Consolidé
  y = sectionTitle(pdf, 'Consolidated - all entities in scope', y);
  y = drawTable(pdf, {
    x: MARGIN,
    y,
    widths: [contentW * 0.34, contentW * 0.24, contentW * 0.24, contentW * 0.18],
    align: ['left', 'right', 'right', 'right'],
    header: ['Indicator', 'Actuals', 'Budget', 'Achievement'],
    rows: consolidated.map(l => [
      l.label,
      eur(l.actuals),
      l.budget ? eur(l.budget) : DASH,
      l.achievement === null ? DASH : pct(l.achievement),
    ]),
    goodBad: consolidated.map(l => (l.budget !== 0 ? l.actuals >= l.budget : null)),
  });
  y += 8;

  // Graphique consolidé — même lecture visuelle immédiate que les KPI cards de l'écran
  y = ensureRoom(58, y);
  y = drawBarChart(pdf, {
    x: MARGIN,
    y,
    width: contentW,
    height: 48,
    series: consolidated.map(l => ({ label: l.label, actuals: l.actuals, budget: l.budget })),
    fmt: v => eur(v, true),
    legend: ['Actuals', 'Budget'],
  });
  y += 10;

  // Ratios clés — marges + poids des principaux postes de coût dans le revenu
  if (ratios.length > 0) {
    y = ensureRoom(10 + ratios.length * ROW_H, y);
    y = sectionTitle(pdf, 'Key ratios', y);
    y = drawTable(pdf, {
      x: MARGIN,
      y,
      widths: [contentW * 0.4, contentW * 0.2, contentW * 0.2, contentW * 0.2],
      align: ['left', 'right', 'right', 'right'],
      header: ['Ratio', 'Actuals', 'Target', 'Gap'],
      rows: ratios.map(r => [
        r.label,
        r.actuals === null ? DASH : pct(r.actuals),
        r.target === null ? DASH : pct(r.target),
        r.actuals === null || r.target === null ? DASH : `${((r.actuals - r.target) * 100 >= 0 ? '+' : '')}${((r.actuals - r.target) * 100).toFixed(1)}pp`,
      ]),
      goodBad: ratios.map(r => {
        if (r.actuals === null || r.target === null) return null;
        return r.lowerIsBetter ? r.actuals <= r.target : r.actuals >= r.target;
      }),
    });
    y += 12;
  }

  // Comparaison N / N-1
  if (yoy.length > 0) {
    y = ensureRoom(10 + yoy.length * ROW_H, y);
    y = sectionTitle(pdf, 'Year-over-year', y);
    y = drawTable(pdf, {
      x: MARGIN,
      y,
      widths: [contentW * 0.34, contentW * 0.24, contentW * 0.24, contentW * 0.18],
      align: ['left', 'right', 'right', 'right'],
      header: ['Indicator', 'This period', 'Prior year', 'Growth'],
      rows: yoy.map(l => [l.label, eur(l.current, true), eur(l.prior, true), l.growth === null ? DASH : pct(l.growth)]),
      goodBad: yoy.map(l => (l.growth === null ? null : l.growth >= 0)),
    });
    y += 12;
  }

  // Par entité
  y = ensureRoom(10 + (entities.length || 1) * ROW_H, y);
  y = sectionTitle(pdf, 'By entity - Actuals for the period', y);
  const labels = consolidated.map(l => l.label);
  const entW = contentW * 0.34;
  const numW = (contentW - entW) / labels.length;
  y = drawTable(pdf, {
    x: MARGIN,
    y,
    widths: [entW, ...labels.map(() => numW)],
    align: ['left', ...labels.map(() => 'right' as const)],
    header: ['Entity', ...labels],
    rows: entities.map(e => [
      `${e.nom} (${e.nomCourt})`,
      ...e.lines.map(l => (l.actuals ? eur(l.actuals, true) : DASH)),
    ]),
    totalRow: entities.length > 0 ? { cells: ['TOTAL', ...consolidated.map(l => eur(l.actuals, true))] } : undefined,
    emptyLabel: 'No entity in this scope',
  });
  y += 8;

  // Graphique Revenue par entité (Actuals vs Budget) — seule la 1re ligne (Revenue) pour rester lisible
  if (entities.length > 0) {
    y = ensureRoom(58, y);
    y = drawBarChart(pdf, {
      x: MARGIN,
      y,
      width: contentW,
      height: 48,
      series: entities.map(e => ({ label: e.nomCourt, actuals: e.lines[0]?.actuals ?? 0, budget: e.lines[0]?.budget ?? 0 })),
      fmt: v => eur(v, true),
      legend: [`${labels[0]} - Actuals`, `${labels[0]} - Budget`],
    });
    y += 10;
  }

  // ── Focus - Clients ──────────────────────────────────────────────────────
  if (clients && (clients.topClients.length > 0 || clients.groups.length > 0)) {
    const totalClientRevenue = clients.groups.reduce((s, g) => s + g.revenue, 0);
    const totalClientMargin = clients.groups.reduce((s, g) => s + g.margin, 0);

    y = ensureRoom(20, y);
    y = sectionTitle(pdf, 'Focus - Clients', y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...GREY);
    text(pdf, 'Client-level revenue and margin, aggregated across all entities in scope (source: client P&L import).', MARGIN, y);
    y += 7;

    if (clients.groups.length > 0) {
      y = ensureRoom(10 + clients.groups.length * ROW_H, y);
      y = drawTable(pdf, {
        x: MARGIN,
        y,
        widths: [contentW * 0.34, contentW * 0.22, contentW * 0.14, contentW * 0.16, contentW * 0.14],
        align: ['left', 'right', 'right', 'right', 'right'],
        header: ['Client group', 'Revenue', '% total', 'Margin', 'Margin %'],
        rows: clients.groups.map(g => [
          g.groupe,
          eur(g.revenue, true),
          pct(g.share),
          eur(g.margin, true),
          g.marginRate === null ? DASH : pct(g.marginRate),
        ]),
        totalRow: { cells: ['TOTAL', eur(totalClientRevenue, true), pct(1), eur(totalClientMargin, true), totalClientRevenue !== 0 ? pct(totalClientMargin / totalClientRevenue) : DASH] },
      });
      y += 8;

      y = ensureRoom(50, y);
      y = drawBarChart(pdf, {
        x: MARGIN,
        y,
        width: contentW,
        height: 42,
        series: clients.groups.map(g => ({ label: g.groupe, actuals: g.revenue })),
        fmt: v => eur(v, true),
      });
      y += 10;
    }

    if (clients.topClients.length > 0) {
      y = ensureRoom(10 + clients.topClients.length * ROW_H, y);
      y = sectionTitle(pdf, 'Top clients by revenue', y);
      y = drawTable(pdf, {
        x: MARGIN,
        y,
        widths: [contentW * 0.36, contentW * 0.18, contentW * 0.2, contentW * 0.14, contentW * 0.12],
        align: ['left', 'left', 'right', 'right', 'right'],
        header: ['Client', 'Group', 'Revenue', 'Margin %', 'vs Budget'],
        rows: clients.topClients.map(c => [
          c.clientNom,
          c.groupe,
          eur(c.revenue, true),
          c.marginRate === null ? DASH : pct(c.marginRate),
          c.achievement === null ? DASH : pct(c.achievement),
        ]),
      });
      y += 12;
    }
  }

  // Enseignements clés (générés automatiquement, identiques à ceux affichés à l'écran) — texte
  // enroulé sur plusieurs lignes au besoin (pdf.splitTextToSize gère la largeur, contrairement à
  // text()/drawTable qui tronquent avec "...").
  if (insights.length > 0) {
    y = ensureRoom(16, y);
    y = sectionTitle(pdf, 'Key insights & takeaways', y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...INK);
    for (const ins of insights) {
      const wrapped = pdf.splitTextToSize(asc(`-  ${ins}`), contentW - 2) as string[];
      for (const line of wrapped) {
        y = ensureRoom(5.5, y);
        pdf.text(line, MARGIN, y);
        y += 5;
      }
      y += 1.5;
    }
  }

  y += 4;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8);
  pdf.setTextColor(...GREY);
  text(
    pdf,
    `"${DASH}" = no data for this entity over the period. Budget/Target figures are YTD as imported (cumulative to each entity's reference month), not prorated to the chosen range.`,
    MARGIN,
    ensureRoom(6, y),
  );

  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    text(pdf, `${orgName} - Reporting Group - Confidential`, MARGIN, pageH - 8);
    text(pdf, `Page ${i} / ${total}`, pageW - MARGIN, pageH - 8, { align: 'right' });
  }

  const slug = scopeLabel.toLowerCase().replace(/\s+/g, '-');
  pdf.save(`full-report-${slug}-${generatedAt.toISOString().slice(0, 10)}.pdf`);
}
