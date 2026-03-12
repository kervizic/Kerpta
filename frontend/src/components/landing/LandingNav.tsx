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
          <span className="font-sarpanch text-xl text-gray-900 dark:text-white">KERPTA</span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
          >
            Se connecter
          </button>
        </div>
      </div>
    </nav>
  )
}
