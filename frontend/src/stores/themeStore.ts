// Kerpta — Application comptable web française
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

// Store de thème (clair / sombre).
// Persiste dans localStorage["kerpta_theme"].
// Applique la classe "dark" sur <html> pour activer le dark mode Tailwind.

import { create } from 'zustand'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggle: () => void
}

function applyTheme(theme: Theme): void {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('kerpta_theme', theme)
}

// Lecture initiale depuis localStorage (défaut : clair)
const stored = localStorage.getItem('kerpta_theme') as Theme | null
const initial: Theme = stored === 'dark' ? 'dark' : 'light'
applyTheme(initial)

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: initial,

  toggle() {
    set((s) => {
      const next: Theme = s.theme === 'light' ? 'dark' : 'light'
      applyTheme(next)
      return { theme: next }
    })
  },
}))
