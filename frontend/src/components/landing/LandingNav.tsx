// Kerpta — Navigation de la page vitrine
import { Github } from 'lucide-react'

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

        {/* Liens */}
        <div className="flex items-center gap-6">
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
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  )
}
