// Kerpta — Lien Trustpilot stylé (remplace le widget externe)
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { Star } from 'lucide-react'

export function TrustpilotWidget() {
  return (
    <a
      href="https://fr.trustpilot.com/review/kerpta.fr"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl border border-kerpta text-sm font-semibold transition-all bg-white hover:bg-kerpta-50 dark:bg-gray-900 dark:hover:bg-kerpta-900/20 shadow-sm"
    >
      <span className="text-gray-700 dark:text-gray-200">Évaluez-nous sur</span>
      <span className="inline-flex items-center gap-1">
        <Star className="w-4 h-4 fill-kerpta text-kerpta" />
        <span className="font-bold text-gray-900 dark:text-white">Trustpilot</span>
      </span>
    </a>
  )
}
