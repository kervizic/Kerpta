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
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-white">Kerpta</span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            AGPL-3.0
          </span>
        </a>

        {/* Liens + bouton connexion */}
        <div className="flex items-center gap-4">
          <a href="#features" className="hidden sm:block text-sm text-slate-400 hover:text-white transition">
            Fonctionnalités
          </a>
          <a href="#pricing" className="hidden sm:block text-sm text-slate-400 hover:text-white transition">
            Tarifs
          </a>
          <a href="#open-source" className="hidden sm:block text-sm text-slate-400 hover:text-white transition">
            Installation
          </a>
          <a
            href="https://github.com/kervizic/kerpta"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>

          {/* Bouton Se connecter */}
          <button
            onClick={handleLogin}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
          >
            Se connecter
          </button>
        </div>
      </div>
    </nav>
  )
}
