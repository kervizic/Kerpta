// Kerpta - Fonctions de formatage centralisees
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 - https://www.gnu.org/licenses/agpl-3.0.html

/** Formate un montant en euros (ex: 1 234,56 EUR) */
export function fmtCurrency(v: number): string {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

/** Formate un prix (retourne '-' si null/undefined) */
export function fmtPrice(v: number | null | undefined): string {
  if (v == null) return '\u2014'
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

/** Formate un montant arrondi sans decimales (ex: 1 234 EUR) */
export function fmtCurrencyRounded(v: number | null | undefined): string {
  if (v == null) return '\u2014'
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
