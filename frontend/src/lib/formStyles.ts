// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

/**
 * Styles partagés pour les champs de formulaire.
 * Utiliser ces constantes partout pour garantir une hauteur uniforme.
 */

/** Champ de formulaire standard (header / sections) — hauteur fixe 38px */
export const INPUT = 'w-full h-[38px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 transition'

/** Select de formulaire standard — même hauteur que INPUT */
export const SELECT = `${INPUT} bg-white dark:bg-gray-800`

/** Champ de ligne de document (table inline : devis, factures) — hauteur fixe 30px */
export const LINE_INPUT = 'w-full h-[30px] px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-orange-400'

/** Select de ligne de document — même hauteur que LINE_INPUT */
export const LINE_SELECT = `${LINE_INPUT} bg-white dark:bg-gray-800`
