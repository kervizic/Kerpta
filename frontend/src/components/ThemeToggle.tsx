// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Bouton flottant en bas à droite pour basculer entre mode clair et sombre.

import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore()

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full flex items-center justify-center
        bg-white dark:bg-slate-800
        border border-gray-200 dark:border-white/10
        text-gray-500 dark:text-slate-400
        hover:text-orange-600 dark:hover:text-orange-400
        shadow-md hover:shadow-lg
        transition-all duration-200"
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  )
}
