// Kerpta — Layout standard pour les pages de l'application
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import type { ReactNode } from 'react'

const MAX_W = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
} as const

interface PageLayoutProps {
  /** Icone affichee dans le carre arrondi du header */
  icon: ReactNode
  /** Titre principal de la page */
  title: string
  /** Sous-titre / description */
  subtitle?: string
  /** Largeur max du contenu : sm (2xl), md (4xl), lg (5xl) */
  size?: keyof typeof MAX_W
  /** Actions a droite du header (boutons) */
  actions?: ReactNode
  /** Contenu de la page */
  children: ReactNode
}

export default function PageLayout({
  icon,
  title,
  subtitle,
  size = 'lg',
  actions,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={`${MAX_W[size]} mx-auto px-6 py-8`}>
        {/* En-tete */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-kerpta-50 border border-kerpta-200 flex items-center justify-center shrink-0">
              {icon}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {/* Contenu */}
        {children}
      </div>
    </div>
  )
}
