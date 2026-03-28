// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

/**
 * Styles partagés pour les champs de formulaire.
 * Utiliser ces constantes partout pour garantir une hauteur uniforme.
 */

/** Champ de formulaire standard (header / sections) — hauteur fixe 38px */
export const INPUT = 'w-full h-[38px] px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-400 transition'

/** Select de formulaire standard — même hauteur que INPUT */
export const SELECT = `${INPUT} bg-white dark:bg-gray-800`

/** Champ de ligne de document (table inline : devis, factures) — hauteur fixe 30px */
export const LINE_INPUT = 'w-full h-[30px] px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded focus:outline-none focus:ring-1 focus:ring-kerpta-400'

/** Select de ligne de document — même hauteur que LINE_INPUT */
export const LINE_SELECT = `${LINE_INPUT} bg-white dark:bg-gray-800`

/** Label de ligne de document (plus petit que LABEL, pour les editeurs inline) */
export const LINE_LABEL = 'text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 block'

// ─── Boutons ──────────────────────────────────────────────────────────────

/** Bouton principal (outlined kerpta) — utiliser pour toutes les actions principales */
export const BTN = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 border border-kerpta text-kerpta bg-white hover:bg-kerpta-50 dark:bg-gray-800 dark:text-kerpta-400 dark:hover:bg-kerpta-900/20'

/** Bouton principal petit (xs) */
export const BTN_SM = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition disabled:opacity-50 border border-kerpta text-kerpta bg-white hover:bg-kerpta-50 dark:bg-gray-800 dark:text-kerpta-400 dark:hover:bg-kerpta-900/20'

/** Bouton secondaire (gris, pour annuler, fermer) */
export const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700'

/** Bouton danger (rouge, pour supprimer) */
export const BTN_DANGER = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition disabled:opacity-50 border border-red-400 text-red-600 bg-white hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20'

/** Bouton danger petit */
export const BTN_DANGER_SM = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition disabled:opacity-50 border border-red-400 text-red-600 bg-white hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20'

/** Bouton texte kerpta (lien, action secondaire inline) */
export const BTN_LINK = 'text-[10px] text-kerpta hover:text-kerpta-600 dark:text-kerpta-400 dark:hover:text-kerpta-300 transition inline-flex items-center gap-0.5'

/** Bouton texte gris (reinitialiser, annuler discret) */
export const BTN_LINK_GRAY = 'text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition inline-flex items-center gap-1'

/** Bouton icone fermeture (X dans les modales, overlays) */
export const BTN_CLOSE = 'p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'

// ─── Overlays ─────────────────────────────────────────────────────────────

/** Backdrop d'overlay (fond semi-transparent) */
export const OVERLAY_BACKDROP = 'fixed inset-0 z-50 flex items-start justify-center bg-black/30 overflow-y-auto overscroll-contain'

/** Panel d'overlay (le contenu blanc/sombre) */
export const OVERLAY_PANEL = 'relative w-full mx-2 md:mx-6 max-w-5xl mt-2 md:mt-8 mb-2 md:mb-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl dark:shadow-black/50 overflow-hidden'

/** Header sticky d'overlay */
export const OVERLAY_HEADER = 'sticky top-0 z-10 flex items-center justify-between px-4 md:px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'

// ─── Cards / Containers ──────────────────────────────────────────────────

/** Card blanche standard (liste, section) */
export const CARD = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl'

/** Section de formulaire avec titre */
export const SECTION = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-6'

/** Label de formulaire */
export const LABEL = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1'

// ─── Badges ───────────────────────────────────────────────────────────────

/** Textarea multi-lignes (notes, mentions legales, pied de page) */
export const TEXTAREA = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-kerpta-400 transition resize-y'

/** Dropdown menu positionne (autocomplete, suggestions) */
export const DROPDOWN = 'absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-y-auto'

/** Badge compteur (notification, filtre actif) */
export const BADGE_COUNT = 'bg-kerpta text-white text-[9px] font-bold rounded-full flex items-center justify-center'

// ─── Landing page ───────────────────────────────────────────────────────

/** Bouton CTA landing page (outlined kerpta avec shadow) */
export const BTN_LANDING = 'inline-flex items-center justify-center gap-2 rounded-xl border border-kerpta text-kerpta font-semibold transition-all bg-white hover:bg-kerpta-50 dark:bg-gray-900 dark:text-kerpta-400 dark:hover:bg-kerpta-900/20 shadow-lg shadow-kerpta/15 hover:shadow-kerpta/30'
