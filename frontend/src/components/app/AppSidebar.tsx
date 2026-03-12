// Kerpta — Sidebar de l'application
// Copyright (C) 2026 Emmanuel Kervizic
// Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

import type { ReactNode } from 'react'
import { KeyRound, LogOut, Settings } from 'lucide-react'
import { navigate } from '@/hooks/useRoute'
import { useAuthStore } from '@/stores/authStore'

interface AppSidebarProps {
  currentPath: string
}

interface NavItem {
  label: string
  href: string
  icon: ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Clés API',
    href: '/app/config/api-keys',
    icon: <KeyRound className="w-4 h-4" />,
  },
]

export function AppSidebar({ currentPath }: AppSidebarProps) {
  const { user, logout } = useAuthStore()

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-slate-900 border-r border-white/5 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">Kerpta</span>
          <span className="text-xs font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded px-1.5 py-0.5">
            Admin
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {/* Groupe Configuration */}
        <div className="mb-2">
          <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Configuration
            </span>
          </div>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = currentPath === item.href
              return (
                <li key={item.href}>
                  <button
                    onClick={() => navigate(item.href)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* Profil + déconnexion */}
      <div className="px-3 py-4 border-t border-white/5">
        {user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover bg-slate-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-300 text-sm font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-slate-500 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
