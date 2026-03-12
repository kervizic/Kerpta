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
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Clés API',
    href: '/app/config/api-keys',
    icon: <KeyRound className="w-4 h-4" />,
    adminOnly: true,
  },
]

export function AppSidebar({ currentPath }: AppSidebarProps) {
  const { user, logout, isAdmin } = useAuthStore()

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 bg-white border-r border-gray-200 flex flex-col">
      {/* Logo — lien vers la page d'accueil kerpta.fr */}
      <div className="px-5 py-5 border-b border-gray-200">
        <a href="/" className="flex items-center gap-2 group">
          <span className="text-lg font-bold text-gray-900 group-hover:text-orange-600 transition">
            Kerpta
          </span>
          <span className="text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 rounded px-1.5 py-0.5">
            Admin
          </span>
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {isAdmin && visibleItems.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
              <Settings className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Configuration
              </span>
            </div>
            <ul className="space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = currentPath === item.href
                return (
                  <li key={item.href}>
                    <button
                      onClick={() => navigate(item.href)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-orange-50 text-orange-700 border border-orange-200'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
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
        )}

        {(isAdmin === null || !isAdmin) && (
          <p className="text-xs text-gray-400 px-2 py-2">Chargement des droits…</p>
        )}
      </nav>

      {/* Profil + déconnexion */}
      <div className="px-3 py-4 border-t border-gray-200">
        {user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-2">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover bg-gray-100"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 text-sm font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{user.name}</div>
              <div className="text-xs text-gray-400 truncate">{user.email}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
