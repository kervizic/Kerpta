// Kerpta — Composant réutilisable d'info contextuelle (toggle au clic)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'

interface InfoHintProps {
  children: ReactNode
  /** Taille de l'icône — 'sm' dans les labels, 'md' dans les titres de section */
  size?: 'sm' | 'md'
}

/**
 * Encadré info toggle au clic : icône (i) → panneau orange/blanc avec texte gris.
 * Supporte le dark mode via les classes Tailwind dark:.
 */
export function InfoHint({ children, size = 'sm' }: InfoHintProps) {
  const [open, setOpen] = useState(false)

  const iconSize = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'
  const padding = size === 'md' ? 'p-1' : 'p-0.5'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${padding} rounded-md transition ${
          open
            ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10'
            : 'text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10'
        }`}
      >
        <Info className={iconSize} />
      </button>
      {open && (
        <div className="text-xs text-gray-600 dark:text-gray-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg px-3 py-2 space-y-0.5">
          {children}
        </div>
      )}
    </>
  )
}
