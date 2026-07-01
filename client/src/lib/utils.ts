import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEur(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M€`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K€`;
  }
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatVariation(value: number): string {
  const pct = (value * 100).toFixed(1);
  return value >= 0 ? `+${pct}%` : `${pct}%`;
}

export const MOIS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export function moisLabel(mois: number): string {
  return MOIS_FR[mois - 1] ?? '';
}

export function colorByVariation(val: number): string {
  if (val >= 0.9) return 'text-green-600';
  if (val >= 0.7) return 'text-orange-500';
  return 'text-red-600';
}

export function bgByVariation(val: number): string {
  if (val >= 0.9) return 'bg-green-50 text-green-700';
  if (val >= 0.7) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
}
