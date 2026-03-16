// Kerpta — Navigation de la page vitrine
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import { Github } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'

function handleLogin() {
  const token = localStorage.getItem('supabase_access_token')
  navigate(token ? '/app' : '/login')
}

export function LandingNav() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-200 dark:border-white/5 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="font-sarpanch text-2xl leading-none">
            <span className="text-[#888888] dark:text-gray-300">KER</span><span className="text-kerpta">PTA</span>
          </span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-kerpta-50 text-kerpta-600 border border-kerpta-200 dark:bg-kerpta/20 dark:text-kerpta-300 dark:border-kerpta/30">
            AGPL-3.0
          </span>
        </a>

        {/* Liens + bouton connexion */}
        <div className="flex items-center gap-4">
          <a href="#features" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition">
            Fonctionnalités
          </a>
          <a href="#pricing" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition">
            Tarifs
          </a>
          <a href="#open-source" className="hidden sm:block text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition">
            Installation
          </a>
          <a
            href="https://github.com/kervizic/kerpta"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>

          {/* Bouton Se connecter */}
          <button
            onClick={handleLogin}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-kerpta-600 hover:bg-kerpta text-white text-sm font-semibold transition-all shadow-lg shadow-kerpta/25 hover:shadow-kerpta/40"
          >
            Se connecter
          </button>
        </div>
      </div>
    </nav>
  )
}
